**4. Get the root Gismu schema document**

*Method 1 (Recommended): Filter by its known PubKey*

```javascript
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: {
      pubKey: '0x0000000000000000000000000000000000000000000000000000000000000000' // GENESIS_PUBKEY
    }
  }
};
```

*Method 2: Filter by its self-referencing schema*
(Less direct, but demonstrates the concept)

```javascript
const gismuRef = '@0x0000000000000000000000000000000000000000000000000000000000000000'; // @ + GENESIS_PUBKEY
const query: HqlQueryRequest = {
  operation: 'query',
  filter: {
    meta: { schema: gismuRef }
  }
};
``` 