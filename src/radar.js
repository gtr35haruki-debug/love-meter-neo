export function radarSvg(values, size=420, child=false){
  const labels=child?[['いっしょにうごいた','direction'],['ドキドキ','magnitude'],['タイミング','temporal'],['バランス','balance'],['しつもん反応','questionResponse']]:[['息ぴったり','direction'],['ドキドキ','magnitude'],['同時リアクション','temporal'],['リアクションバランス','balance'],['質問ヒット','questionResponse']];
  const c=size/2,r=size*.32;
  const pt=(i,scale=1)=>{const a=-Math.PI/2+i*2*Math.PI/5;return [c+Math.cos(a)*r*scale,c+Math.sin(a)*r*scale]};
  const poly=(scale)=>labels.map((_,i)=>pt(i,scale).join(',')).join(' ');
  const data=labels.map(([,k],i)=>pt(i,Math.max(0,Math.min(100,Number(values?.[k])||0))/100).join(',')).join(' ');
  const axes=labels.map((_,i)=>{const [x,y]=pt(i,1);return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" class="radar-axis"/>`}).join('');
  const text=labels.map(([label],i)=>{const [x,y]=pt(i,1.26);return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${label}</text>`}).join('');
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="5指標レーダーチャート">
    <polygon points="${poly(1)}" class="radar-grid outer"/>
    <polygon points="${poly(.66)}" class="radar-grid"/>
    <polygon points="${poly(.33)}" class="radar-grid"/>
    ${axes}
    <polygon points="${data}" class="radar-data"/>
    ${text}
  </svg>`;
}
