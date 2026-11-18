import {readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'

const base = process.argv[2] || '/'
const dist = resolve(process.argv[3] || 'dist')
const html = await readFile(resolve(dist,'index.html'),'utf8')
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1])
assert.ok(assets.length >= 2,'Expected emitted JavaScript and CSS')
assert.match(html,/Content-Security-Policy/)
for (const asset of assets) {
  assert.ok(asset.startsWith(base+'assets/'),`Incorrect asset prefix: ${asset}`)
  assert.ok((await readFile(resolve(dist,asset.slice(base.length)))).length > 0)
}
assert.deepEqual((await readdir(dist)).sort(),['assets','index.html'])
console.log('Verified entry assets for '+base)
