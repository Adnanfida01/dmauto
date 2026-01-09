import { createClient } from 'redis';

async function main(){
  const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  client.on('error', (e)=>console.error('redis client err', e));
  await client.connect();
  const list = await client.lRange('automation_queue', 0, -1);
  console.log('automation_queue length:', list.length);
  if(list.length>0) list.forEach((it,i)=>console.log('['+i+']', it));
  await client.disconnect();
}

main().catch(e=>{ console.error('script error', e && e.stack); process.exit(1); });
