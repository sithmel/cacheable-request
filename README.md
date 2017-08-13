# cacheable-request

> Wrap native HTTP requests with RFC compliant cache support

[![Build Status](https://travis-ci.org/lukechilds/cacheable-request.svg?branch=master)](https://travis-ci.org/lukechilds/cacheable-request)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/cacheable-request/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/cacheable-request?branch=master)
[![npm](https://img.shields.io/npm/v/cacheable-request.svg)](https://www.npmjs.com/package/cacheable-request)

[RFC 7234](http://httpwg.org/specs/rfc7234.html) compliant HTTP caching for native Node.js HTTP/HTTPS requests. Caching works out of the box in memory or is easily pluggable with a wide range of cache adapters.

## Install

```shell
npm install --save cacheable-request
```

## Usage

```js
const http = require('http');
const CacheableRequest = require('cacheable-request');

// Then instead of
const req = http.request('example.com', cb);
req.end();

// You can do
const cacheableRequest = new CacheableRequest(http.request);
const cacheReq = cacheableRequest('example.com', cb);
cacheReq.on('request', req => req.end());
// Future requests to 'example.com' will be returned from cache if still valid

// You pass in any other http.request API compatible method to be wrapped with cache support:
const cacheableRequest = new CacheableRequest(https.request);
const cacheableRequest = new CacheableRequest(electron.net);
```

## Cache Adapters

> TODO

## API

### cacheableRequest(request, opts, [cb])

Returns an event emitter.

#### request

Type: `function`

Request function to wrap with cache support. Should be [`http.request`](https://nodejs.org/api/http.html#http_http_request_options_callback) or a similar API compatible request function.

#### opts

Type: `object`

Any of the default request functions options plus:

##### opts.cache

Type `cache adapter instance`

The cache adapter should follow the [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) API. You can pass `new Map()` to cache items in memory, or a [Keyv storage adapter](https://github.com/lukechilds/keyv#official-storage-adapters) if you want a shared persistent store.

The `cache` option can be omitted and the request will be passed directly through to the request function with no caching.

##### opts.strictTtl

Type: `object`<br>
Default `false`

If set to `false` expired resources are still kept in the cache and will be revalidated on the next request with `If-None-Match`/`If-Modified-Since` headers.

If set to `true` once a cached resource has expired it is deleted and will have to be re-requested.

#### cb

Type: `function`

The callback function which will receive the response as an argument. The response can be either a [Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage) or a [responselike object](https://github.com/lukechilds/responselike).

#### .on('request', request)

`request` event to get the request object of the request.

**Note:** This event will only fire if an HTTP request is actually made, not when a response is retrieved from cache. However, you should always handle the `request` event to end the request and handle any potential request errors.

#### .on('response', response)

`response` event to get the response object from the HTTP request or cache.

#### .on('error', error)

`error` event emitted in case of an error with the cache logic.

**Note:** You still need to handle requst errors on `request`. e.g:

```js
cacheableRequest(http.request, opts, cb)
  .on('error', handleCacheError)
  .on('request', req => {
    req.on('error', handleRequestError);
    req.end();
  });
```

## License

MIT © Luke Childs
