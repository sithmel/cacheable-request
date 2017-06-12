import EventEmitter from 'events';
import { request } from 'http';
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
	const returnValue = cacheableRequest(request, s.url, () => t.end()).on('request', req => req.end());
	t.true(returnValue instanceof EventEmitter);
});

test('cacheableRequest throws TypeError if request fn isn\'t passed in', t => {
	const error = t.throws(() => {
		cacheableRequest('not a request function', s.url);
	}, TypeError);
	t.is(error.message, 'Parameter `request` must be a function');
});

test.cb('cacheableRequest accepts url as string', t => {
	cacheableRequest(request, s.url, response => {
		getStream(response).then(body => {
			t.is(body, 'hi');
			t.end();
		});
	}).on('request', req => req.end());
});

test.after('cleanup', async () => {
	await s.close();
});
