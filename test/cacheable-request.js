import { request } from 'http';
import test from 'ava';
import cacheableRequest from '../';

test('cacheableRequest is a function', t => {
	t.is(typeof cacheableRequest, 'function');
});

test('cacheableRequest(request) returns a function', t => {
	t.is(typeof cacheableRequest(request), 'function');
});
