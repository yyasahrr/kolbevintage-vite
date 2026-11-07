// The bundled demo looks were supplied on a green screen. Derive transparent
// demo-only images from the preserved originals; never process merchant uploads.
import sharp from "sharp";
for (let n=1;n<=6;n++) {
  const {data,info}=await sharp(`src/assets/raw/look-${n}.png`).resize(900,1350).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const background=[data[0],data[1],data[2]];
  const backgroundGreen=background[1]-Math.max(background[0],background[2]);
  for(let k=0;k<data.length;k+=4) {
    const green=data[k+1]-Math.max(data[k],data[k+2]);
    const alpha=Math.max(0,Math.min(1,(backgroundGreen-green-5)/(backgroundGreen-18)));
    if(alpha<0.02){data[k+3]=0;continue;}
    if(alpha<1) for(let j=0;j<3;j++) data[k+j]=Math.max(0,Math.min(255,Math.round((data[k+j]-(1-alpha)*background[j])/alpha)));
    data[k+3]=Math.round(alpha*255);
  }
  await sharp(data,{raw:info}).webp({quality:90,alphaQuality:100}).toFile(`src/assets/models/look-${n}.webp`);
}
