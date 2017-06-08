'use strict';

const EventEmitter = require('events');

const cacheableRequest = request => (opts, cb) => {
	opts = opts || {};

	const ee = new EventEmitter();

	const get = opts => {
		const req = request(opts, cb);
		ee.emit('request', req);
	};

	setImmediate(() => get(opts));

	return ee;
};

module.exports = cacheableRequest;
