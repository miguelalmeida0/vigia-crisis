let pending=null;
export async function ensureGeoTiff(){
  if(globalThis.GeoTIFF?.fromUrl)return globalThis.GeoTIFF;
  if(pending)return pending;
  pending=new Promise((resolve)=>{
    const script=document.createElement('script');
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve(globalThis.GeoTIFF?.fromUrl?globalThis.GeoTIFF:null);};
    script.src='https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js';script.async=true;script.crossOrigin='anonymous';script.referrerPolicy='no-referrer';script.onload=finish;script.onerror=finish;
    const timer=setTimeout(finish,8_000);document.head.append(script);
  });
  return pending;
}
