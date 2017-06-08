'use strict';

const EventEmitter = require('events');
const urlLib = require('url');
const normalizeUrl = require('normalize-url');
const getStream = require('get-stream');
const CachePolicy = require('http-cache-semantics');
const urlParseLax = require('url-parse-lax');
const Response = require('responselike');

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

	const ee = new EventEmitter();
	const key = cacheKey(opts);

	const makeRequest = opts => {
		const req = request(opts, response => {
			response.cachePolicy = new CachePolicy(opts, response);
			response.fromCache = false;

			if (cache && response.cachePolicy.storable()) {
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
			}

			if (typeof cb === 'function') {
				cb(response);
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
		}
	});

	get(opts);

	return ee;
};

module.exports = cacheableRequest;
