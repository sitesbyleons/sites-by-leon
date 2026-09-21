import fs from 'node:fs';
// Natural Earth 1:110m admin-0, public domain. Equirectangular projection.
const input=JSON.parse(fs.readFileSync(new URL('../work/statistics-world.geojson',import.meta.url),'utf8'));
const countries=input.features.map(f=>{
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  const d=polygons.map(poly=>poly.map(ring=>ring.map(([lon,lat],i)=>`${i?'L':'M'}${((lon+180)*2).toFixed(1)},${((90-lat)*2).toFixed(1)}`).join('')+'Z').join('')).join('');
  return {code:f.properties.ISO_A2_EH,name:f.properties.NAME_EN,d};
});
fs.writeFileSync(new URL('../photographer-site/src/lib/statistics-world.json',import.meta.url),JSON.stringify(countries));
