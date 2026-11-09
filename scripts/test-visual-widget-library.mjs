// Tests every registered widget's defaults against the API validator and the
// same Puck renderer used by the storefront. No database or network required.
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Render} from '@puckeditor/core/rsc';
import {makeVisualConfig} from '../shared/visual-config.tsx';
import {validateVisual} from '../shared/visual-schema.ts';
import {extraVisualSpec} from '../shared/visual-extra-spec.ts';
import {utilityVisualSpec} from '../shared/visual-utility-spec.ts';
import {commerceVisualSpec} from '../shared/visual-commerce-spec.ts';
import {selectCommerceProducts} from '../shared/visual-commerce-selection.ts';
import {advancedVisualSpec,visualSlotNames} from '../shared/visual-advanced-spec.ts';
// tsx runs files outside tsconfig's include with the classic JSX transform.
globalThis.React = React;
const config=makeVisualConfig(()=>React.createElement('div',null,'products'),()=>React.createElement('div',null,'categories'),(kind,props)=>React.createElement('div',null,kind,props.heading));
const doc=(type,props)=>({root:{props:{}},content:[{type,props:{...props,id:`test-${type}`}}]});
for(const [name,component] of Object.entries(config.components)){
  const value=doc(name,component.defaultProps);
  assert.deepEqual(validateVisual(value),value,`${name}: default data`);
  const html=renderToStaticMarkup(React.createElement(Render,{config,data:value}));
  assert(html.length>0,`${name}: renders content`);
  assert.throws(()=>validateVisual(doc(name,{...component.defaultProps,unexpected:'no'})),undefined,`${name}: unknown fields rejected`);
  if(name in extraVisualSpec || name in advancedVisualSpec || name in commerceVisualSpec || name in utilityVisualSpec) {
    const spec=extraVisualSpec[name] || advancedVisualSpec[name] || commerceVisualSpec[name] || utilityVisualSpec[name];
    assert.deepEqual(Object.keys(component.fields||{}).sort(),Object.keys(spec).sort(),`${name}: field/schema match`);
    for(const [field,kind] of Object.entries(spec)) {
      if(kind==='utcDate') { for(const bad of ['2027-02-30T00:00:00Z','2030-01-01','2030-01-01T00:00:00+03:30','anything']) assert.throws(()=>validateVisual(doc(name,{...component.defaultProps,[field]:bad}))); validateVisual(doc(name,{...component.defaultProps,[field]:'2030-01-01T00:00:00Z'})); }
      if(kind==='reference') { for(const bad of ['../evil','a b','a'.repeat(121),'javascript:foo']) assert.throws(()=>validateVisual(doc(name,{...component.defaultProps,[field]:bad})),undefined,`${name}.${field}: unsafe reference`); }
      if(kind==='url'||kind==='image') {
        for(const bad of ['javascript:alert(1)','//evil.example/a','https://user:pass@example.com/a'])
          assert.throws(()=>validateVisual(doc(name,{...component.defaultProps,[field]:bad})),undefined,`${name}.${field}: unsafe URL`);
      }
    }
  }
}
const headings=Object.entries(config.categories).flatMap(([,c])=>c.components);
assert.equal(new Set(headings).size,Object.keys(config.components).length,'all widgets categorized exactly once');
for (const [name,slots] of Object.entries(visualSlotNames)) for(const key of slots) assert.equal(config.components[name].fields[key].type,'slot',`${name}.${key}: destination slot`);
assert.throws(()=>validateVisual(doc('Container',{...config.components.Container.defaultProps,width:1601})));
assert.throws(()=>validateVisual(doc('SplitLayout',{...config.components.SplitLayout.defaultProps,ratio:'unexpected'})));
const faq=doc('FAQ',config.components.FAQ.defaultProps);
assert.match(renderToStaticMarkup(React.createElement(Render,{config,data:faq})),/<details>/);
const col=doc('ColumnsFour',{...config.components.ColumnsFour.defaultProps,first:[{type:'Badge',props:{...config.components.Badge.defaultProps,id:'inside'}}]});
validateVisual(col);assert.match(renderToStaticMarkup(React.createElement(Render,{config,data:col})),/جدید/);
const old=doc('Heading',{text:'قدیمی',size:36,color:'#171429',align:'right'});validateVisual(old);
assert.throws(()=>validateVisual({root:{props:{}},content:Array.from({length:101},(_,i)=>({type:'Badge',props:{...config.components.Badge.defaultProps,id:`id${i}`}}))}));
assert.throws(()=>validateVisual({root:{props:{}},content:[{type:'__proto__',props:{id:'x'}}]}));
console.log(`${Object.keys(config.components).length} widget defaults validated and rendered; URLs, nested slots, old data and limits checked`);

const products=[{id:'a',name:'A',category:'کت',garment:'coat',featured:true,stock:{x:2},complements:['c','b','missing','c','a']},{id:'b',name:'B',category:'کت',garment:'coat',featured:false,stock:{x:0},complements:[]},{id:'c',name:'C',category:'دیگر',garment:'shirt',featured:false,stock:{x:7},complements:[]}];
const categories=[{id:'cat',name:'کت',active:true,garments:['coat']},{id:'inactive',name:'دیگر',active:false,garments:['shirt']}];
const choose=(kind,extra={})=>selectCommerceProducts(kind,{products,categories,count:12,stockFresh:true,...extra}).map(p=>p.id);
assert.deepEqual(choose('LiveFeatured'),['a']);assert.deepEqual(choose('LiveAvailable'),['a','c']);assert.deepEqual(choose('LiveAvailable',{stockFresh:false}),[]);assert.deepEqual(choose('LiveLowStock'),['a']);
assert.deepEqual(choose('LiveCategory',{categoryId:'cat'}),['a','b']);assert.deepEqual(choose('LiveCategory',{categoryId:'missing'}),[]);assert.deepEqual(choose('LiveCategory',{categoryId:'inactive'}),[]);
const childCategories=[{id:'parent',name:'اصلی',active:true,garments:['shirt']},{id:'child',parentId:'parent',name:'دیگر',active:false,garments:['shirt']}];assert.deepEqual(choose('LiveCategory',{categoryId:'parent',categories:childCategories}),[],'inactive child must not leak via garment fallback');
assert.deepEqual(choose('LiveRelated',{productId:'a'}),['c','b']);assert.deepEqual(choose('LiveRelated',{productId:'missing'}),[]);assert.deepEqual(choose('LiveProduct',{productId:''}),[]);
assert.deepEqual(choose('LiveWishlist',{wishlist:['a','missing']}),['a']);assert.deepEqual(choose('LiveOrderLeaders',{leaders:[{productId:'c',sold:4},{productId:'missing',sold:10},{productId:'a',sold:1}]}),['c','a']);
console.log('Commerce selection, stock freshness, missing references and ordering checked');

assert.throws(()=>validateVisual(doc('ProgressMeter',{...config.components.ProgressMeter.defaultProps,value:101})));
const anchor=(id)=>({type:'AnchorSection',props:{id,anchor:'same',content:[]}});assert.throws(()=>validateVisual({root:{props:{}},content:[anchor('one'),anchor('two')]}),'duplicate anchor names rejected');
