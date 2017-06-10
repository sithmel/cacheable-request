'use strict';

const EventEmitter = require('events');
const urlLib = require('url');
const normalizeUrl = require('normalize-url');
const getStream = require('get-stream');
const CachePolicy = require('http-cache-semantics');
const urlParseLax = require('url-parse-lax');
const Response = require('responselike');
const lowercaseKeys = require('lowercase-keys');
const cloneResponse = require('clone-response');

const cacheKey = opts => {
	const url = normalizeUrl(urlLib.format(opts));
	return `${opts.method}:${url}`;
};

const cacheableRequest = (request, cache) => (opts, cb) => {
	if (typeof opts === 'string') {
		opts = urlParseLax(opts);
	}
	opts = Object.assign({
		headers: {},
		method: 'GET'
	}, opts);
	opts.headers = lowercaseKeys(opts.headers);

	const ee = new EventEmitter();
	const key = cacheKey(opts);

	const makeRequest = opts => {
		const req = request(opts, response => {
			if (opts._revalidate) {
				const revalidatedPolicy = CachePolicy.fromObject(opts._revalidate.cachePolicy).revalidatedPolicy(opts, response);
				if (!revalidatedPolicy.modified) {
					const headers = revalidatedPolicy.policy.responseHeaders();
					response = new Response(opts._revalidate.statusCode, headers, opts._revalidate.body, opts._revalidate.url);
					response.cachePolicy = revalidatedPolicy.policy;
					response.fromCache = true;
				}
			}

			if (!response.fromCache) {
				response.cachePolicy = new CachePolicy(opts, response);
				response.fromCache = false;
			}

			let clonedResponse;
			if (cache && response.cachePolicy.storable()) {
				clonedResponse = cloneResponse(response);
				getStream.buffer(response).then(body => {
					const value = {
						cachePolicy: response.cachePolicy.toObject(),
						url: response.url,
						statusCode: response.statusCode,
						body
					};
					const ttl = response.cachePolicy.timeToLive();
					cache.set(key, value, ttl);
				});
			} else if (opts._revalidate) {
				opts.cache.delete(key);
			}

			if (typeof cb === 'function') {
				cb(clonedResponse || response);
			}
		});
		ee.emit('request', req);
	};

	const get = opts => Promise.resolve(cache.get(key)).then(cacheEntry => {
		if (typeof cacheEntry === 'undefined') {
			return makeRequest(opts, cb);
		}

		const policy = CachePolicy.fromObject(cacheEntry.cachePolicy);
		if (policy.satisfiesWithoutRevalidation(opts)) {
			const headers = policy.responseHeaders();
			const response = new Response(cacheEntry.statusCode, headers, cacheEntry.body, cacheEntry.url);
			response.cachePolicy = policy;
			response.fromCache = true;

			if (typeof cb === 'function') {
				cb(response);
			}
		} else {
			opts._revalidate = cacheEntry;
			opts.headers = policy.revalidationHeaders(opts);
			makeRequest(opts);
		}
	});

	get(opts);

	return ee;
};

module.exports = cacheableRequest;
