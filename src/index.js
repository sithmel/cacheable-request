'use strict';

const EventEmitter = require('events');
const urlLib = require('url');
const normalizeUrl = require('normalize-url');
const getStream = require('get-stream');
const CachePolicy = require('http-cache-semantics');
const urlParseLax = require('url-parse-lax');

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

	const get = opts => {
		const req = request(opts, response => {
			response.cachePolicy = new CachePolicy(opts, response);

			if (cache && response.cachePolicy.storable()) {
				getStream.buffer(response).then(body => {
					const key = cacheKey(opts);
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

	setImmediate(() => get(opts));

	return ee;
};

module.exports = cacheableRequest;
