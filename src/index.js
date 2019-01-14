'use strict';

const EventEmitter = require('events');
const urlLib = require('url');
const normalizeUrl = require('normalize-url');
const getStream = require('get-stream');
const CachePolicy = require('http-cache-semantics');
const Response = require('responselike');
const lowercaseKeys = require('lowercase-keys');
const PassThrough = require('stream').PassThrough;
const mimicResponse = require('mimic-response');
const Keyv = require('keyv');

const prepareOptsAndURL = opts => {
	let url;
	if (typeof opts === 'string') {
		url = normalizeUrlObject(urlLib.parse(opts));
		opts = {};
	} else if (opts instanceof urlLib.URL) {
		url = normalizeUrlObject(urlLib.parse(opts.toString()));
		opts = {};
	} else {
		const [pathname, ...searchParts] = (opts.path || '').split('?');
		const search = searchParts.length > 0 ?
			`?${searchParts.join('?')}` :
			'';
		url = normalizeUrlObject({ ...opts, pathname, search });
	}
	opts = {
		headers: {},
		method: 'GET',
		cache: true,
		strictTtl: false,
		automaticFailover: false,
		...opts,
		...urlObjectToRequestOptions(url)
	};
	opts.headers = lowercaseKeys(opts.headers);

	const normalizedUrlString = normalizeUrl(
		urlLib.format(url),
		{
			stripWWW: false,
			removeTrailingSlash: false,
			stripAuthentication: false
		}
	);
	return [opts, normalizedUrlString];
};

const getCachedResponse = async (opts, cache, key) => {
	await Promise.resolve();

	const cacheEntry = opts.cache ? await cache.get(key) : undefined;
	if (typeof cacheEntry === 'undefined') {
		return {};
	}

	const policy = CachePolicy.fromObject(cacheEntry.cachePolicy);
	if (policy.satisfiesWithoutRevalidation(opts) && !opts.forceRefresh) {
		const headers = policy.responseHeaders();
		const response = new Response(cacheEntry.statusCode, headers, cacheEntry.body, cacheEntry.url);
		response.cachePolicy = policy;
		response.fromCache = true;

		return { response };
	}
	return { cacheEntry, policy };
};

const makeRequest = (request, revalidate, opts, cache, key, ee, cb) => {
	let requestErrored = false;
	let requestErrorCallback;

	const requestErrorPromise = new Promise(resolve => {
		requestErrorCallback = () => {
			if (!requestErrored) {
				requestErrored = true;
				resolve();
			}
		};
	});

	const handler = async response => {
		if (revalidate && !opts.forceRefresh) {
			response.status = response.statusCode;
			const revalidatedPolicy = CachePolicy.fromObject(revalidate.cachePolicy).revalidatedPolicy(opts, response);
			if (!revalidatedPolicy.modified) {
				const headers = revalidatedPolicy.policy.responseHeaders();
				response = new Response(revalidate.statusCode, headers, revalidate.body, revalidate.url);
				response.cachePolicy = revalidatedPolicy.policy;
				response.fromCache = true;
			}
		}

		if (!response.fromCache) {
			response.cachePolicy = new CachePolicy(opts, response, opts);
			response.fromCache = false;
		}

		let clonedResponse;
		if (opts.cache && response.cachePolicy.storable()) {
			clonedResponse = cloneResponse(response);

			try {
				const bodyPromise = getStream.buffer(response);

				await Promise.race([
					requestErrorPromise,
					new Promise(resolve => response.once('end', resolve))
				]);

				if (requestErrored) {
					return;
				}

				const body = await bodyPromise;

				const value = {
					cachePolicy: response.cachePolicy.toObject(),
					url: response.url,
					statusCode: response.fromCache ? revalidate.statusCode : response.statusCode,
					body
				};

				let ttl = opts.strictTtl ? response.cachePolicy.timeToLive() : undefined;
				if (opts.maxTtl) {
					ttl = ttl ? Math.min(ttl, opts.maxTtl) : opts.maxTtl;
				}
				await cache.set(key, value, ttl);
			} catch (error) {
				ee.emit('error', new CacheableRequest.CacheError(error));
			}
		} else if (opts.cache && revalidate) {
			try {
				await cache.delete(key);
			} catch (error) {
				ee.emit('error', new CacheableRequest.CacheError(error));
			}
		}

		ee.emit('response', clonedResponse || response);
		if (typeof cb === 'function') {
			cb(clonedResponse || response);
		}
	};

	try {
		const req = request(opts, handler);
		req.once('error', requestErrorCallback);
		req.once('abort', requestErrorCallback);
		ee.emit('request', req);
	} catch (error) {
		ee.emit('error', new CacheableRequest.RequestError(error));
	}
};

class CacheableRequest {
	constructor(request, cacheAdapter) {
		if (typeof request !== 'function') {
			throw new TypeError('Parameter `request` must be a function');
		}

		this.cache = new Keyv({
			uri: typeof cacheAdapter === 'string' && cacheAdapter,
			store: typeof cacheAdapter !== 'string' && cacheAdapter,
			namespace: 'cacheable-request'
		});

		return this.createCacheableRequest(request);
	}

	createCacheableRequest(request) {
		return (opts, cb) => {
			const optsAndURL = prepareOptsAndURL(opts);
			opts = optsAndURL[0];
			const normalizedUrlString = optsAndURL[1];

			const ee = new EventEmitter();
			const key = `${opts.method}:${normalizedUrlString}`;
			let revalidate = false;

			// This is a small memory leak. Need to correct it.
			this.cache.on('error', err => ee.emit('error', new CacheableRequest.CacheError(err)));

			(async () => {
				let data;

				try {
					data = await getCachedResponse(opts, this.cache, key);
				} catch (error) {
					// There was an error getting data from cache.
					if (opts.automaticFailover) {
						makeRequest(request, revalidate, opts, this.cache, key, ee, cb);
					}
					// Emit the error about cache.
					ee.emit('error', new CacheableRequest.CacheError(error));
					return;
				}

				if (data.response) {
				// Response is found in cache and it's VALID response.
				// no need to make request. return the response from cache.

					ee.emit('response', data.response);
					if (typeof cb === 'function') {
						cb(data.response);
					}
				} else if (data.cacheEntry) {
				// Response is found in cache but we need to REVALIDATE it.
				// setting appropriate headers and making request to revalidate.

					revalidate = data.cacheEntry;
					opts.headers = data.policy.revalidationHeaders(opts);
					makeRequest(request, revalidate, opts, this.cache, key, ee, cb);
				} else {
				// Response is NOT FOUND in cache. Making normal request.
					makeRequest(request, revalidate, opts, this.cache, key, ee, cb);
				}
			})();

			return ee;
		};
	}
}

function urlObjectToRequestOptions(url) {
	const options = { ...url };
	options.path = `${url.pathname || '/'}${url.search || ''}`;
	delete options.pathname;
	delete options.search;
	return options;
}

function normalizeUrlObject(url) {
	// If url was parsed by url.parse or new URL:
	// - hostname will be set
	// - host will be hostname[:port]
	// - port will be set if it was explicit in the parsed string
	// Otherwise, url was from request options:
	// - hostname or host may be set
	// - host shall not have port encoded
	return {
		protocol: url.protocol,
		auth: url.auth,
		hostname: url.hostname || url.host || 'localhost',
		port: url.port,
		pathname: url.pathname,
		search: url.search
	};
}

function cloneResponse(response) {
	if (!(response && response.pipe)) {
		throw new TypeError('Parameter `response` must be a response stream.');
	}

	const clone = new PassThrough();
	mimicResponse(response, clone);

	return response.pipe(clone);
};

CacheableRequest.RequestError = class extends Error {
	constructor(err) {
		super(err.message);
		this.name = 'RequestError';
		Object.assign(this, err);
	}
};

CacheableRequest.CacheError = class extends Error {
	constructor(err) {
		super(err.message);
		this.name = 'CacheError';
		Object.assign(this, err);
	}
};

module.exports = CacheableRequest;
