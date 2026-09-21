import assert from 'node:assert/strict';
import {demoDesignFor,renderDemoDocument} from '../photographer-site/src/lib/demo-design.mjs';
for(const host of ['ishotyouu.leonsites.org','www.ishotyouu.net','leonsites.org','other.leonsites.org','demo.leonsites.org.attacker.example'])for(const route of ['/','/work','/packages','/contact'])assert.equal(demoDesignFor(host,route),null);
for(const route of ['/admin','/api/inquiry','/sign-in','/sign-up','/journal','/work/a/b'])assert.equal(demoDesignFor('demo.leonsites.org',route),null);
assert.equal(demoDesignFor('demo.leonsites.org','/'),'sports');
assert.equal(demoDesignFor('vow-and-light.leonsites.org','/work/recent-stories'),'wedding');
const html=renderDemoDocument({kind:'sports',pathname:'/work',canonicalOrigin:'https://demo.leonsites.org',portfolio:{studioName:'<script>alert(1)</script>',galleries:[],packages:[]}});
assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('&lt;script&gt;'));
console.log('Exact-host/route isolation and escaped portfolio text passed.');
