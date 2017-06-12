import EventEmitter from 'events';
import { request } from 'http';
import test from 'ava';
import createTestServer from 'create-test-server';
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

test.after('cleanup', async () => {
	await s.close();
});
