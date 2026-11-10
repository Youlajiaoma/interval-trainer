'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readSource} = require('./helpers/app-harness.cjs');
function environment({reduced = false, supported = true} = {}) {
  const animations = [], listeners = new Map();
  const preference = {matches:reduced,addEventListener(type,handler) { listeners.set(type,handler); }};
  function element(kind = 'settings-dialog') {
    const classes = new Set([kind]), events = new Map();
    const item = {open:false,inert:false,closed:0,
      classList:{contains:name => classes.has(name),add:name => classes.add(name),remove:name => classes.delete(name)},
      addEventListener(type,handler) { events.set(type,handler); },
      showModal() { this.open = true; },
      close(value) { this.open = false; this.closed++; this.value = value; events.get('close')?.(); },
      cancelEvent() { const event = {defaultPrevented:false,preventDefault() { this.defaultPrevented = true; }}; events.get('cancel')?.(event); return event; }
    };
    if (supported) item.animate = (frames,options) => {
      let resolve, reject, settled = false;
      const animation = {element:item,frames,options,finished:new Promise((a,b) => { resolve = a; reject = b; }),
        finish() { if (!settled) { settled = true; this.finishedNormally = true; resolve(); } },
        cancel() { if (!settled) { settled = true; this.cancelled = true; reject(Error('cancelled')); } }};
      animations.push(animation); return animation;
    };
    return item;
  }
  const shell = element('shell'), root = {
    matchMedia:() => preference,CSS:{supports:() => true},getComputedStyle:() => ({opacity:'.7',transform:'matrix(1,0,0,1,12,0)'})
  };
  vm.runInNewContext(readSource('motion.js'),{window:root,document:{querySelector:() => shell}});
  return {api:root.TonaloomMotion,element,animations,shell,reduce() { preference.matches = true; listeners.get('change')(); }};
}
test('导航立即更新页面状态，进入与返回方向相反，连续导航取消旧动画',() => {
  const env = environment(); let value = 0;
  env.api.navigate(() => { value = 1; }); assert.equal(value,1);
  assert.equal(env.animations[0].frames[0].transform,'translateX(24px)');
  env.api.navigate(() => { value = 2; },'back'); assert.equal(value,2);
  assert(env.animations[0].cancelled); assert.equal(env.animations[1].frames[0].transform,'translateX(-24px)');
});
test('弹窗退出动画结束后才关闭；重复关闭只执行一次并恢复交互状态',async () => {
  const env = environment(), dialog = env.element(); env.api.open(dialog);
  env.animations.at(-1).finish(); await Promise.resolve();
  const closing = env.api.close(dialog,'done'); assert(dialog.open && dialog.inert);
  assert.equal(env.api.close(dialog),closing);
  env.animations.at(-1).finish(); await closing;
  assert(!dialog.open && !dialog.inert); assert.equal(dialog.closed,1); assert.equal(dialog.value,'done');
});
test('关闭过程中重新打开，旧动画不会关闭新界面或清除新遮罩动画',async () => {
  const env = environment(), dialog = env.element(); env.api.open(dialog);
  const closing = env.api.close(dialog);
  env.api.open(dialog); await closing;
  assert(dialog.open && !dialog.inert);
  assert.equal(dialog.closed,0); assert(dialog.classList.contains('motion-dialog-opening'));
  assert(!dialog.classList.contains('motion-dialog-closing'));
  env.animations.at(-1).finish(); await Promise.resolve();
  assert(!dialog.classList.contains('motion-dialog-opening'));
});
test('Escape 使用退出动画，不提前移除弹窗',async () => {
  const env = environment(), dialog = env.element('stats-dialog'); env.api.open(dialog);
  const event = dialog.cancelEvent(); assert(event.defaultPrevented); assert(dialog.open);
  assert.equal(env.animations.at(-1).frames.at(-1).transform,'translateY(18px)');
  env.animations.at(-1).finish(); await Promise.resolve(); assert(!dialog.open);
});
for (const options of [{reduced:true},{supported:false}]) test(`减少动态效果或无动画支持时立即完成所有切换：${JSON.stringify(options)}`,async () => {
  const env = environment(options), dialog = env.element(); let updated = false;
  env.api.navigate(() => { updated = true; }); assert(updated);
  env.api.open(dialog); assert(dialog.open); env.api.close(dialog); assert(!dialog.open);
  assert.equal(env.animations.length,0);
});
test('动画途中开启减少动态效果，立即完成退出并清理遮罩状态',async () => {
  const env = environment(), dialog = env.element(); env.api.open(dialog);
  const closing = env.api.close(dialog); env.reduce(); await closing;
  assert(!dialog.open && !dialog.inert);
  assert(!dialog.classList.contains('motion-dialog-closing'));
});
test('原生关闭弹窗时取消未完成动画，不会遗留不可操作状态',async () => {
  const env = environment(), dialog = env.element(); env.api.open(dialog);
  const closing = env.api.close(dialog); dialog.close(); await closing;
  assert(!dialog.inert); assert.equal(dialog.closed,1);
  assert(!dialog.classList.contains('motion-dialog-closing'));
});
