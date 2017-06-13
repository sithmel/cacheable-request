# cacheable-request

> Wrap native HTTP requests with RFC compliant cache support

[![Build Status](https://travis-ci.org/lukechilds/cacheable-request.svg?branch=master)](https://travis-ci.org/lukechilds/cacheable-request)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/cacheable-request/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/cacheable-request?branch=master)
[![npm](https://img.shields.io/npm/v/cacheable-request.svg)](https://www.npmjs.com/package/cacheable-request)

[RFC 7234](http://httpwg.org/specs/rfc7234.html) compliant caching for native Node.js HTTP/HTTPS requests. Caching works out of the box in memory with `new Map()` or is easily pluggable with a wide range of cache adapters.

## Install

```shell
npm install --save cacheable-request
```

## License

MIT © Luke Childs
