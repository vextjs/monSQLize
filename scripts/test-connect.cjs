const M = require('../lib/index.js');
const m = new M({type:'mongodb', databaseName:'test', config:{useMemoryServer:true}});
m.connect().then(c=>{
  console.log('connected ok');
  console.log('collection type:', typeof c.collection);
  if (typeof c.collection === 'object' && c.collection !== null) {
    console.log('collection keys:', Object.keys(c.collection).slice(0,5));
  }
  process.exit(0);
}).catch(e=>{
  console.error('error:', e.message);
  process.exit(0);
});
