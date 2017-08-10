'use strict';

const EventEmitter = require('events');
const urlLib = require('url');
const normalizeUrl = require('normalize-url');
const getStream = require('get-stream');
const CachePolicy = require('http-cache-semantics');
const Response = require('responselike');
const lowercaseKeys = require('lowercase-keys');
const cloneResponse = require('clone-response');
const Keyv = require('keyv');

const cacheKey = opts => {
	const url = normalizeUrl(urlLib.format(opts));
	return `${opts.method}:${url}`;
};

const cacheableRequest = (request, opts, cb) => {
	if (typeof opts === 'string') {
		opts = urlLib.parse(opts);
	}
	opts = Object.assign({
		headers: {},
		method: 'GET',
		cache: false
	}, opts);
	opts.headers = lowercaseKeys(opts.headers);

	if (typeof request !== 'function') {
		throw new TypeError('Parameter `request` must be a function');
	}

	const cache = new Keyv({ store: opts.cache });
	const ee = new EventEmitter();
	const key = cacheKey(opts);
	let revalidate = false;

	const makeRequest = opts => {
		const req = request(opts, response => {
			if (revalidate) {
				const revalidatedPolicy = CachePolicy.fromObject(revalidate.cachePolicy).revalidatedPolicy(opts, response);
				if (!revalidatedPolicy.modified) {
					const headers = revalidatedPolicy.policy.responseHeaders();
					response = new Response(response.statusCode, headers, revalidate.body, revalidate.url);
					response.cachePolicy = revalidatedPolicy.policy;
					response.fromCache = true;
				}
			}

			if (!response.fromCache) {
				response.cachePolicy = new CachePolicy(opts, response);
				response.fromCache = false;
			}

			let clonedResponse;
			if (opts.cache && response.cachePolicy.storable()) {
				clonedResponse = cloneResponse(response);
				getStream.buffer(response)
					.then(body => {
						const value = {
							cachePolicy: response.cachePolicy.toObject(),
							url: response.url,
							statusCode: response.fromCache ? revalidate.statusCode : response.statusCode,
							body
						};
						const ttl = response.cachePolicy.timeToLive();
						cache.set(key, value, ttl);
					})
					.catch(err => ee.emit('error', err));
			} else if (opts.cache && revalidate) {
				cache.delete(key);
			}

			ee.emit('response', clonedResponse || response);
			if (typeof cb === 'function') {
				cb(clonedResponse || response);
			}
		});
		ee.emit('request', req);
	};

	const get = opts => Promise.resolve()
		.then(() => opts.cache ? cache.get(key) : undefined)
		.then(cacheEntry => {
			if (typeof cacheEntry === 'undefined') {
				return makeRequest(opts);
			}

			const policy = CachePolicy.fromObject(cacheEntry.cachePolicy);
			if (policy.satisfiesWithoutRevalidation(opts)) {
				const headers = policy.responseHeaders();
				const response = new Response(cacheEntry.statusCode, headers, cacheEntry.body, cacheEntry.url);
				response.cachePolicy = policy;
				response.fromCache = true;

				ee.emit('response', response);
				if (typeof cb === 'function') {
					cb(response);
				}
			} else {
				revalidate = cacheEntry;
				opts.headers = policy.revalidationHeaders(opts);
				makeRequest(opts);
			}
		});

	get(opts).catch(err => ee.emit('error', err));

	return ee;
};

module.exports = cacheableRequest;
