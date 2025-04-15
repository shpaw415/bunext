Priority 1

- PassThrough data SSR->Client
- Database Gt, Lt, NotEqual, GtEq, LtEq, Exists
- Fix build import default component in serverComponents
  - temporary workaround: [DefaultName, OtherDefaultName]; when the default component is only used in the ServerComponent
- Fix usePathName
- Add serverComponent Hooks
- Add request url containing @static mapped to the static assets
- Gzip html response 
  - https://developer.chrome.com/docs/lighthouse/performance/uses-text-compression?utm_source=lighthouse&utm_medium=devtools&hl=fr
  - csspurge for head element
  
Priority 2