import redisClient from '../queue/redis.js';

redisClient.on('error', (e) => console.error('redis event error:', e && e.message));

async function main(){
  try{
    console.log('redis client status:', redisClient.status || '(no status)');
    // wait for ready
    let tries = 0;
    while((redisClient.status !== 'ready') && tries < 10){
      await new Promise(r => setTimeout(r, 300));
      tries++;
    }
    console.log('redis client final status:', redisClient.status || '(no status)');

    const list = await redisClient.lrange('automation_queue', 0, -1);
    console.log('automation_queue length:', Array.isArray(list)?list.length:0);
    if(Array.isArray(list) && list.length>0){
      list.forEach((item, i)=>{
        try { console.log('['+i+']', JSON.parse(item)); } catch(e){ console.log('['+i+'] (raw)', item); }
      });
    } else {
      console.log('automation_queue is empty');
    }
    process.exit(0);
  } catch(err){
    console.error('checkQueue error stack:', err && err.stack ? err.stack : err);
    process.exit(1);
  } finally {
    try { await redisClient.disconnect(); } catch(e){}
  }
}

main();
