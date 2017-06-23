import EventEmitter from 'events';
import { request } from 'http';
import url from 'url';
import test from 'ava';
import createTestServer from 'create-test-server';
import getStream from 'get-stream';
import cacheableRequest from '../';

let s;

test.before('setup', async () => {
	s = await createTestServer();
	s.get('/', (req, res) => res.end('hi'));
});

test('cacheableRequest is a function', t => {
	t.is(typeof cacheableRequest, 'function');
});

test.cb('cacheableRequest returns an event emitter', t => {
	const returnValue = cacheableRequest(request, url.parse(s.url), () => t.end()).on('request', req => req.end());
	t.true(returnValue instanceof EventEmitter);
});

test('cacheableRequest throws TypeError if request fn isn\'t passed in', t => {
	const error = t.throws(() => {
		cacheableRequest('not a request function', url.parse(s.url));
	}, TypeError);
	t.is(error.message, 'Parameter `request` must be a function');
});

test.cb('cacheableRequest passes requests through if no cache option is set', t => {
	cacheableRequest(request, url.parse(s.url), response => {
		getStream(response).then(body => {
			t.is(body, 'hi');
			t.end();
		});
	}).on('request', req => req.end());
});

test.cb('cacheableRequest accepts url as string', t => {
	cacheableRequest(request, s.url, response => {
		getStream(response).then(body => {
			t.is(body, 'hi');
			t.end();
		});
	}).on('request', req => req.end());
});

test.cb('cacheableRequest handles no callback parameter', t => {
	cacheableRequest(request, url.parse(s.url)).on('request', req => {
		req.end();
		req.on('response', response => {
			t.is(response.statusCode, 200);
			t.end();
		});
	});
});

test.cb('cacheableRequest emits response event for network responses', t => {
	cacheableRequest(request, url.parse(s.url))
		.on('request', req => req.end())
		.on('response', response => {
			t.false(response.fromCache);
			t.end();
		});
});

test.cb('cacheableRequest emits response event for cached responses', t => {
	const cache = new Map();
	const opts = Object.assign(url.parse(s.url), { cache });
	cacheableRequest(request, opts, () => {
		// This needs to happen in next tick so cache entry has time to be stored
		setImmediate(() => {
			cacheableRequest(request, opts)
				.on('request', req => req.end())
				.on('response', response => {
					t.true(response.fromCache);
					t.end();
				});
		});
	}).on('request', req => req.end());
});

test.cb('cacheableRequest emits error event if cache.get errors', t => {
	const errMessage = 'Get Fail';
	const cache = {
		get: () => {
			throw new Error(errMessage);
		}
	};
	cacheableRequest(request, Object.assign(url.parse(s.url), { cache }))
		.on('error', err => {
			t.is(err.message, errMessage);
			t.end();
		});
});

test.after('cleanup', async () => {
	await s.close();
});
