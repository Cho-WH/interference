import { test, expect, type Page } from '@playwright/test';

const shell = '.teacher-shell';
const comparison = '.teacher-path-overlay [data-view="comparison"]';
const state = (page: Page, attribute: string) => page.locator(shell).getAttribute(`data-${attribute}`);
async function at(page: Page, cue: string) {
  await expect(page.locator(shell)).toHaveAttribute('data-cue', cue);
  await expect(page.locator(shell)).toHaveAttribute('data-transitioning', 'false');
}
async function advance(page: Page, label: string, cue: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await at(page, cue);
}
async function reachBoth(page: Page) {
  await advance(page, 'P의 진동 보기', 's1-probe');
  await expect(page.locator('[data-marker="local-probe-result"]')).toBeVisible();
  await advance(page, '첫 번째 경로 보기', 's2-path1');
  await expect(page.locator(`${comparison} [data-wave-path="source-2"]`)).toBeHidden();
  await advance(page, '두 번째 경로 보기', 's2-path2');
  await expect(page.locator(`${comparison} [data-wave-path="source-1"]`)).toBeHidden();
  await advance(page, '두 경로 함께 보기', 's2-both');
}
async function geometry(page: Page) {
  return page.locator(`${comparison} [data-source-row]`).evaluateAll(rows => rows.map(row => {
    const n = (name: string) => Number(row.getAttribute(name));
    const line = row.querySelector('[data-path-baseline]')!;
    const l = (name: string) => Number(line.getAttribute(name));
    return { distance: n('data-distance'), scale: n('data-path-scale'), angle: n('data-path-angle'),
      start: [n('data-start-x'), n('data-start-y')],
      length: Math.hypot(l('x2') - l('x1'), l('y2') - l('y1')) };
  }));
}

test('teacher wave palette defaults to water and can change while paused without changing the experiment', async ({ page }) => {
  await page.goto('/?mode=teacher'); await at(page, 's1-field');
  const canvas = page.locator('.teacher-background canvas');
  await expect(canvas).toHaveAttribute('data-palette', 'water');
  await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
  await expect(page.locator(shell)).toHaveAttribute('data-playing', 'false');
  const time = await state(page, 'time-seconds'), probe = await state(page, 'probe-x');
  await page.getByRole('button', { name: '도구', exact: true }).click();
  const palette = page.getByRole('combobox', { name: '파동 색상', exact: true });
  await expect(palette).toHaveValue('water');
  for (const id of ['contrast', 'silver', 'water']) {
    await palette.selectOption(id);
    await expect(canvas).toHaveAttribute('data-palette', id);
    expect(await state(page, 'time-seconds')).toBe(time);
    expect(await state(page, 'probe-x')).toBe(probe);
    expect(await state(page, 'playing')).toBe('false');
  }
  await palette.selectOption('silver');
  await page.getByRole('button', { name: '닫기 · Esc', exact: true }).click();
  await advance(page, 'P의 진동 보기', 's1-probe');
  await expect(canvas).toHaveAttribute('data-palette', 'silver');
  await page.getByRole('button', { name: '도구', exact: true }).click();
  await expect(palette).toHaveValue('silver');
});

test('moving P after observing its vibration keeps stage-specific guidance throughout analysis', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?mode=teacher'); await at(page, 's1-field');
  await advance(page, 'P의 진동 보기', 's1-probe');
  await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
  const initialX = Number(await state(page, 'probe-x'));
  await page.getByRole('button', { name: '관측점 P. 방향키로 이동', exact: true }).press('ArrowLeft');
  await expect.poll(async () => Number(await state(page, 'probe-x'))).toBeCloseTo(initialX - .005, 10);
  const movedX = await state(page, 'probe-x');
  const question = page.locator('.teacher-question');
  await expect(question).toHaveText('주변에는 변화가 있는데, P의 합은 시간이 지나도 어떨까요?');
  await advance(page, '첫 번째 경로 보기', 's2-path1');
  await expect(question).toHaveText('파원 1의 파동은 P에서 어떻게 진동하나요?');
  await advance(page, '두 번째 경로 보기', 's2-path2');
  await expect(question).toHaveText('파원 2의 파동도 P에 도착하고 있나요?');
  await advance(page, '두 경로 함께 보기', 's2-both');
  await advance(page, '멈추고 펼치기', 's3-parallel');
  await expect(question).toHaveText('거리를 바꾼 걸까요, 같은 경로를 펼친 걸까요?');
  await advance(page, '크게 비교하기', 's4-fit');
  await advance(page, '같은 거리 짚기', 's4-common');
  await advance(page, '남는 길이 보기', 's4-extra');
  await advance(page, '파장 눈금 보기', 's4-ruler');
  await advance(page, '거리 수치 확인', 's4-values');
  await expect(question).toHaveText('지금의 경로차는 파장의 몇 배이며, P에서 어떤 위상차를 만들까요?');
  await advance(page, '도착점 보기', 's5-endpoints');
  await advance(page, '재생하며 관찰', 's5-components-playing');
  await advance(page, '합 공개', 's5-sum');
  await expect(question).toHaveText('두 성분의 변위와 P의 합성 진동은 어떻게 연결되나요?');
  expect(await state(page, 'probe-x')).toBe(movedX);
});

test('prediction masks every answer channel and a paused cross-context jump waits without auto reveal', async ({ page }) => {
  await page.goto('/?mode=teacher'); await at(page, 's1-field');
  await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
  const time = await state(page, 'time-seconds');
  await page.getByRole('button', { name: '1 / 8 · 전체 현상', exact: true }).click();
  await page.getByRole('button', { name: '같은 P의 새로운 합 · 조건 C 적용', exact: true }).click();
  await at(page, 's7-c-change');
  expect(await state(page, 'time-seconds')).toBe(time);
  await expect(page.getByRole('button', { name: '결과 확인', exact: true })).toBeDisabled();
  await expect(page.locator('.teacher-background')).toBeHidden();
  for (const selector of ['[data-wave-path]', '[data-marker="sum"]', '[data-marker="source-1"]', '[data-marker="source-2"]'])
    for (const node of await page.locator(comparison + ' ' + selector).all()) await expect(node).toBeHidden();
  await page.getByRole('button', { name: '도구', exact: true }).click();
  await page.getByRole('button', { name: '변화 과정 생략', exact: true }).click();
  await expect(page.getByRole('button', { name: '결과 확인', exact: true })).toBeEnabled();
  await at(page, 's7-c-change');
  await advance(page, '결과 확인', 's7-c-paths');
  await expect(page.locator(comparison + ' [data-marker="sum"]')).toBeHidden();
  await advance(page, '합 공개', 's7-c-sum');
  await expect(page.locator(comparison + ' [data-marker="sum"]')).toBeVisible();
  await advance(page, '전체로 돌아가기', 's8-field');
  await advance(page, '간섭 조건 정리', 's8-rule');
  await expect(page.locator('.teacher-rule')).toBeVisible();
});

test('B returns to the current spatial P, moves while paused, then unfolds before revealing the result', async ({ page }) => {
  await page.goto('/?mode=teacher'); await at(page, 's1-field');
  await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
  await expect(page.locator(shell)).toHaveAttribute('data-playing', 'false');
  const initialX = Number(await state(page, 'probe-x'));
  await page.getByRole('button', { name: '관측점 P. 방향키로 이동', exact: true }).press('ArrowLeft');
  // Keyboard input schedules a render; wait for the moved coordinate before retaining it.
  await expect.poll(async () => Number(await state(page, 'probe-x'))).toBeCloseTo(initialX - .005, 10);
  const manualX = await state(page, 'probe-x'), time = await state(page, 'time-seconds');
  await page.getByRole('button', { name: '1 / 8 · 전체 현상', exact: true }).click();
  await page.getByRole('button', { name: '합성 진동', exact: true }).click(); await at(page, 's5-sum');
  await advance(page, '공간으로 돌아가기', 's6-a-space');
  expect(await state(page, 'probe-x')).toBe(manualX);
  await expect(page.locator('.teacher-background')).toBeVisible();
  await page.getByRole('button', { name: '조건 B로 · P 옮기기', exact: true }).click();
  await expect(page.locator(shell)).toHaveAttribute('data-cue', 's6-b-space');
  await expect(page.locator(shell)).toHaveAttribute('data-transitioning', 'true');
  const movingY = Number(await page.locator('.teacher-stage').getAttribute('data-observation-y'));
  expect(movingY).toBeGreaterThan(.0975); expect(movingY).toBeLessThanOrEqual(.238125);
  await expect(page.locator('.teacher-background')).toBeVisible();
  await expect(page.locator('[data-marker="local-probe-result"]')).toBeHidden();
  await at(page, 's6-b-space');
  await expect(page.locator('.teacher-background')).toBeVisible();
  const spatial = await geometry(page);
  await page.getByRole('button', { name: '새 경로 펼치기', exact: true }).click();
  await expect(page.locator(shell)).toHaveAttribute('data-cue', 's6-b-parallel');
  await expect(page.locator('.teacher-background')).toBeVisible();
  await at(page, 's6-b-parallel');
  await expect(page.locator('.teacher-background')).toBeHidden();
  const parallel = await geometry(page);
  parallel.forEach((row, i) => {
    expect(row.scale).toBeCloseTo(spatial[i].scale, 7);
    expect(row.length).toBeCloseTo(spatial[i].length, 7);
    expect(row.angle).toBe(0);
  });
  await advance(page, '거리와 파장 비교', 's6-b-predict');
  await expect(page.locator(`${comparison} [data-path-distance="source-1"]`)).toHaveText('45.0 cm');
  await expect(page.locator(`${comparison} [data-path-distance="source-2"]`)).toHaveText('60.0 cm');
  for (const wave of await page.locator(comparison + ' [data-wave-path]').all()) await expect(wave).toBeVisible();
  for (const selector of ['[data-marker="sum"]', '[data-marker="source-1"]', '[data-marker="source-2"]'])
    for (const node of await page.locator(comparison + ' ' + selector).all()) await expect(node).toBeHidden();
  await advance(page, '경로와 성분 확인', 's6-b-paths');
  await expect(page.locator(comparison + ' [data-marker="sum"]')).toBeHidden();
  await advance(page, '합 공개', 's6-b-sum');
  await expect(page.locator(comparison + ' [data-marker="sum"]')).toBeVisible();
  expect(await state(page, 'playing')).toBe('false'); expect(await state(page, 'time-seconds')).toBe(time);
});

test('question editing, undo and rehearsal return preserve the editable draft', async ({ page }) => {
  await page.goto('/?mode=teacher'); await at(page, 's1-field');
  await page.getByRole('button', { name: '도구', exact: true }).click();
  await page.getByRole('button', { name: '수업 준비 · 저장', exact: true }).click();
  const question = page.getByLabel('학생에게 보일 질문', { exact: true });
  await question.fill('두 경로의 길이는 어떤 관계인가요?'); await question.press('Tab');
  await expect(page.getByRole('button', { name: '되돌리기', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '이 단계부터 리허설', exact: true }).click();
  await expect(page.locator('.teacher-question')).toHaveText('두 경로의 길이는 어떤 관계인가요?');
  await page.getByRole('button', { name: '리허설 끝내기', exact: true }).click();
  await expect(question).toHaveValue('두 경로의 길이는 어떤 관계인가요?');
  await page.getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(question).toHaveValue('두 파동이 겹치면 모든 곳이 더 크게 진동할까요?');
});

test('ordinary entry and direct teacher reload both open the independent lesson route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '교사 수업', exact: true }).click();
  await at(page, 's1-field');
  await expect(page).toHaveURL(/\?mode=teacher$/);
  await page.reload();
  await at(page, 's1-field');
  await expect(page.locator('[data-marker="local-probe-result"]')).toBeHidden();
  await page.getByRole('button', { name: '도구', exact: true }).click();
  await page.getByRole('button', { name: '일반 탐색 화면', exact: true }).click();
  await expect(page.locator('#wave-field')).toBeVisible();
  await expect(page.locator(shell)).toHaveCount(0);
});

test('unfold, manual stop, common zoom and separate disclosures retain one physical experiment', async ({ page }) => {
  await page.goto('/?mode=teacher');
  await at(page, 's1-field');
  await reachBoth(page);
  const spatial = await geometry(page);
  await page.getByRole('button', { name: '멈추고 펼치기', exact: true }).click();
  await expect(page.locator(shell)).toHaveAttribute('data-transitioning', 'true');
  await expect.poll(async () => (await geometry(page))[0].angle).not.toBe(spatial[0].angle);
  const rotating = await geometry(page);
  rotating.forEach((row, index) => {
    expect(row.scale).toBeCloseTo(spatial[index].scale, 7);
    expect(row.length).toBeCloseTo(row.distance * row.scale, 7);
    expect(row.start[0]).toBeCloseTo(spatial[index].start[0], 7);
    expect(row.start[1]).toBeCloseTo(spatial[index].start[1], 7);
  });
  await at(page, 's3-parallel');
  const pausedTime = await state(page, 'time-seconds');
  expect(await state(page, 'playing')).toBe('false');
  await expect(page.getByRole('button', { name: '크게 비교하기', exact: true })).toBeVisible();
  await expect(page.locator(`${comparison} [data-marker="sum"]`)).toBeHidden();
  await expect(page.locator(`${comparison} [data-path-distance="source-1"]`)).toBeHidden();
  await advance(page, '크게 비교하기', 's4-fit');
  const enlarged = await geometry(page);
  expect(enlarged[0].scale).toBeGreaterThan(spatial[0].scale);
  expect(enlarged[0].scale).toBeCloseTo(enlarged[1].scale, 7);
  enlarged.forEach(row => expect(row.length).toBeCloseTo(row.distance * row.scale, 7));
  expect(await state(page, 'time-seconds')).toBe(pausedTime);
  await advance(page, '같은 거리 짚기', 's4-common');
  await expect(page.locator(`${comparison} [data-same-distance-point]`)).toBeVisible();
  await advance(page, '남는 길이 보기', 's4-extra');
  await advance(page, '파장 눈금 보기', 's4-ruler');
  await expect(page.locator(`${comparison} [data-path-distance="source-1"]`)).toBeHidden();
  await advance(page, '거리 수치 확인', 's4-values');
  await expect(page.locator(`${comparison} [data-path-distance="source-1"]`)).toHaveText('45.0 cm');
  await expect(page.locator(`${comparison} [data-path-distance="source-2"]`)).toHaveText('52.5 cm');
  await advance(page, '도착점 보기', 's5-endpoints');
  await expect(page.locator(`${comparison} [data-marker="source-1"]`)).toBeVisible();
  await expect(page.locator(`${comparison} [data-marker="sum"]`)).toBeHidden();
  expect(await state(page, 'time-seconds')).toBe(pausedTime);
  await advance(page, '재생하며 관찰', 's5-components-playing');
  await expect.poll(() => state(page, 'time-seconds')).not.toBe(pausedTime);
  await advance(page, '합 공개', 's5-sum');
  await page.screenshot({ path: 'test-results/teacher-sum.png', fullPage: true });
  const sample = await page.locator(comparison).evaluate(root => {
    const n = (id: string) => Number(root.querySelector(`[data-marker="${id}"]`)!.getAttribute('data-displacement'));
    return { first: n('source-1'), second: n('source-2'), sum: n('sum'), time: root.getAttribute('data-time-seconds') };
  });
  expect(sample.first + sample.second).toBeCloseTo(sample.sum, 10);
  expect(sample.sum).toBeCloseTo(0, 10);
  await page.getByRole('button', { name: '5 / 8 · 같은 P에서 더하기', exact: true }).click();
  await page.getByRole('button', { name: 'P의 진동', exact: true }).click();
  await at(page, 's1-probe');
  await expect(page.locator('[data-marker="local-probe-result"]')).toBeVisible();
  const restored = await geometry(page);
  restored.forEach((row, index) => expect(row.distance).toBeCloseTo(spatial[index].distance, 10));
});

test('reduced motion, keyboard navigation and resize preserve P and never reset physical time', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=teacher');
  await reachBoth(page);
  await advance(page, '멈추고 펼치기', 's3-parallel');
  const frozen = await state(page, 'time-seconds');
  await page.keyboard.press('ArrowRight');
  await at(page, 's4-fit');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1280, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: '같은 거리 짚기', exact: true })).toBeInViewport();
    const rows = await geometry(page);
    expect(rows[0].distance).toBeCloseTo(.45, 10);
    expect(rows[1].distance).toBeCloseTo(.525, 10);
    expect(rows[0].scale).toBeCloseTo(rows[1].scale, 7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/teacher-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await page.keyboard.press('ArrowLeft');
  await at(page, 's3-parallel');
  expect(await state(page, 'time-seconds')).toBe(frozen);
  expect(errors).toEqual([]);
});

test('phone lesson reveals and backward navigation never resize the frozen waves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=teacher'); await at(page, 's1-field');
  await page.getByRole('button', { name: '파동 일시 정지 (K)', exact: true }).click();
  await reachBoth(page);
  const frozenTime = await state(page, 'time-seconds');
  const readInk = () => page.locator(`${comparison} [data-source-row]`).evaluateAll(rows => rows.map(row => {
    const line = row.querySelector<SVGLineElement>('[data-path-baseline]')!;
    const curve = row.querySelector<SVGPathElement>('[data-wave-path]')!;
    const end = row.querySelector<SVGCircleElement>('[data-path-end]')!;
    const matrix = curve.getScreenCTM()!, scale = Math.hypot(matrix.a, matrix.b);
    const a = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(matrix);
    const b = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(matrix);
    return { length: Math.hypot(b.x - a.x, b.y - a.y), waveLength: curve.getTotalLength() * scale,
      stroke: parseFloat(getComputedStyle(curve).strokeWidth) * scale,
      radius: parseFloat(getComputedStyle(end).r) * scale };
  }));
  const original = await readInk();
  const unchanged = async () => {
    (await readInk()).forEach((row, i) => {
      expect(row.length).toBeCloseTo(original[i].length, 3);
      // Rotation rounds each polyline point to .001px; arc length can differ slightly.
      expect(row.waveLength).toBeCloseTo(original[i].waveLength, 1);
      expect(row.stroke).toBeCloseTo(original[i].stroke, 6);
      expect(row.radius).toBeCloseTo(original[i].radius, 6);
    });
    expect(await state(page, 'time-seconds')).toBe(frozenTime);
  };
  for (const [label, cue] of [
    ['멈추고 펼치기', 's3-parallel'], ['크게 비교하기', 's4-fit'], ['같은 거리 짚기', 's4-common'],
    ['남는 길이 보기', 's4-extra'], ['파장 눈금 보기', 's4-ruler'], ['거리 수치 확인', 's4-values'],
    ['도착점 보기', 's5-endpoints'],
  ]) {
    await advance(page, label, cue); await unchanged();
  }
  await page.screenshot({ path: 'test-results/teacher-phone-fixed-scale.png', fullPage: true });
  for (const cue of ['s4-values', 's4-ruler', 's4-extra', 's4-common', 's4-fit', 's3-parallel', 's2-both']) {
    await advance(page, '이전', cue); await unchanged();
  }
});

test('finishing an interrupted transition cannot disclose the next stage and CPU fallback shares the frame', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : original.apply(this, [kind, ...args] as never);
    } as typeof original;
  });
  await page.goto('/?mode=teacher');
  await expect(page.locator('.teacher-background canvas')).toHaveAttribute('data-renderer', 'cpu');
  await reachBoth(page);
  await page.getByRole('button', { name: '멈추고 펼치기', exact: true }).click();
  await page.getByRole('button', { name: '전환 건너뛰기', exact: true }).click();
  await at(page, 's3-parallel');
  const time = await state(page, 'time-seconds');
  await page.getByRole('button', { name: '크게 비교하기', exact: true }).click();
  await expect(page.locator(shell)).toHaveAttribute('data-transitioning', 'true');
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await at(page, 's3-parallel');
  expect(await state(page, 'time-seconds')).toBe(time);
  await page.getByRole('button', { name: '이전', exact: true }).click();
  await at(page, 's2-both');
  expect(await state(page, 'time-seconds')).toBe(time);
  const fieldTime = await page.locator('.teacher-field-overlay').getAttribute('data-time-seconds');
  expect(await page.locator(comparison).getAttribute('data-time-seconds')).toBe(fieldTime);
});

test('teacher resources are released on an explicit session disposal', async ({ page }) => {
  await page.goto('/?mode=teacher');
  await at(page, 's1-field');
  const result = await page.evaluate(async () => {
    // Mount a second isolated session to exercise the actual owner cleanup boundary.
    // @ts-expect-error Vite serves this app module during browser tests.
    const { mountApp } = await import('/src/app/teacher.ts');
    // @ts-expect-error Vite serves this session module during browser tests.
    const { createAppSession } = await import('/src/app/session.ts');
    const root = document.createElement('div');
    document.body.append(root);
    const session = createAppSession();
    mountApp(root, session);
    await new Promise(resolve => requestAnimationFrame(resolve));
    const target = root.querySelector('.teacher-shell')!;
    const before = target.getAttribute('data-time-seconds');
    session.dispose();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = target.getAttribute('data-time-seconds');
    const count = root.childElementCount;
    root.remove();
    return { before, after, count, events: session.events() };
  });
  expect(result.count).toBe(0);
  expect(result.after).toBe(result.before);
  expect(result.events).toEqual([]);
});

for (const stageSize of [{ width: 1280, height: 600, mobile: false }, { width: 390, height: 744, mobile: true }]) {
test(`teacher wave geometry and ink preserve ${stageSize.mobile ? 'mobile size' : 'desktop zoom'} through reversal and reduced motion`, async ({ page }) => {
  await page.setViewportSize({ width: stageSize.width, height: stageSize.height + 100 });
  await page.goto('/?mode=teacher');
  await at(page, 's1-field');
  const samples = await page.evaluate(async size => {
    // Exercise the real stage with one immutable physical frame and deterministic
    // presentation times, so intermediate/reversed poses cannot race a browser RAF.
    // @ts-expect-error Vite serves source modules for this integration fixture.
    const { createTeacherStage, teacherFieldEnvelope } = await import('/src/presentation/stage.ts');
    // @ts-expect-error Vite serves source modules for this integration fixture.
    const { createLessonModel, DEFAULT_LESSON } = await import('/src/lesson/default-lesson.ts');
    // @ts-expect-error Vite serves source modules for this integration fixture.
    const { createRetardedEngine } = await import('/src/physics/retarded-engine.ts');
    // @ts-expect-error Vite serves source modules for this integration fixture.
    const { SEMANTIC_IDS } = await import('/src/lesson/types.ts');
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:0;top:0;width:${size.width}px;height:${size.height}px;z-index:9999;flex:none`;
    document.body.append(host);
    const stage = createTeacherStage(host, { invalidate() {} });
    const model = createLessonModel(), engine = createRetardedEngine(model, teacherFieldEnvelope(model.bounds));
    engine.advanceTo(.371);
    const frame = engine.read(model.probe, stage.getFieldBounds(model)), paths = frame.samplePaths();
    const read = (root: Element) => {
      const svg = root.closest('svg')!;
      const matrix = (element: SVGGraphicsElement) => element.getScreenCTM() ?? svg.getScreenCTM()!;
      const sizeScale = (element: SVGGraphicsElement) => {
        const m = matrix(element);
        return Math.hypot(m.a, m.b);
      };
      const point = (element: SVGGraphicsElement, x: number, y: number) => new DOMPoint(x, y).matrixTransform(matrix(element));
      const styleSize = (element: SVGGraphicsElement, property: string) => parseFloat(getComputedStyle(element).getPropertyValue(property)) * sizeScale(element);
      const rows = Array.from(root.querySelectorAll<SVGGElement>('[data-source-row]')).map(row => {
        const baseline = row.querySelector<SVGLineElement>('[data-path-baseline]')!;
        const curve = row.querySelector<SVGPathElement>('[data-wave-path]')!;
        const start = row.querySelector<SVGCircleElement>('circle')!, end = row.querySelector<SVGCircleElement>('[data-path-end]')!;
        const a = point(baseline, baseline.x1.baseVal.value, baseline.y1.baseVal.value);
        const b = point(baseline, baseline.x2.baseVal.value, baseline.y2.baseVal.value);
        const length = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
        const scale = length / Number(row.getAttribute('data-distance'));
        const coordinates = (curve.getAttribute('d')!.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);
        const wave = [];
        for (let i = 0; i < coordinates.length; i += 2) {
          const p = point(curve, coordinates[i], coordinates[i + 1]);
          const x = p.x - a.x, y = p.y - a.y;
          wave.push([(x * Math.cos(angle) + y * Math.sin(angle)) / scale,
            (-x * Math.sin(angle) + y * Math.cos(angle)) / scale]);
        }
        const cssDash = getComputedStyle(curve).strokeDasharray;
        return { scale, wave, angle, start: [a.x, a.y],
          ink: [styleSize(curve, 'stroke-width'), styleSize(baseline, 'stroke-width'), styleSize(start, 'r'),
            styleSize(start, 'stroke-width'), styleSize(end, 'r'), styleSize(end, 'stroke-width'),
            styleSize(row.querySelector<SVGTextElement>('text')!, 'font-size')],
          dash: cssDash === 'none' ? [] : cssDash.split(/[,\s]+/).map(value => parseFloat(value) * sizeScale(curve)),
        };
      });
      const glyphs = [
        ['[data-same-distance-point]', 'r'], ['[data-same-distance-point]', 'stroke-width'],
        ['[data-same-distance-guide]', 'stroke-width'], ['[data-endpoint-link="source-1"]', 'stroke-width'],
        ['[data-displacement-point="source-1"]', 'r'], ['[data-displacement-point="sum"]', 'r'],
        ['[data-displacement-bar="source-1"]', 'stroke-width'], ['[data-marker="source-1"] line', 'stroke-width'],
        ['[data-marker="source-1"] line:nth-child(2)', 'stroke-width'],
        ['[data-path-difference-ruler] [data-ruler-divisions]', 'stroke-width'],
        ['[data-path-difference-ruler] [data-ruler-halves]', 'stroke-width'],
      ].map(([selector, property]) => styleSize(root.querySelector<SVGGraphicsElement>(selector)!, property));
      const link = root.querySelector<SVGLineElement>('[data-endpoint-link="source-1"]')!;
      const linkDash = getComputedStyle(link).strokeDasharray.split(/[,\s]+/).map(value => parseFloat(value) * sizeScale(link));
      const zero = root.querySelector<SVGLineElement>('[data-marker="source-1"] line:nth-child(2)')!;
      const zeroStart = point(zero, zero.x1.baseVal.value, zero.y1.baseVal.value), zeroEnd = point(zero, zero.x2.baseVal.value, zero.y2.baseVal.value);
      return { rows, glyphs, linkDash, zeroLength: Math.hypot(zeroEnd.x - zeroStart.x, zeroEnd.y - zeroStart.y), time: root.getAttribute('data-time-seconds') };
    };
    const samples = [];
    const take = (name: string, id: string, layout: string, transition: string, now: number, reducedMotion = false) => {
      const result = stage.render(frame, paths, { ...DEFAULT_LESSON.scenes[0].cues[0], id, label: id, experimentContextId: 'A', layout, transition,
        fieldMode: 'wave', visible: SEMANTIC_IDS }, { now, playing: false, reducedMotion });
      const counterpart = host.querySelector<SVGSVGElement>('.teacher-correspondence-overlay')!;
      samples.push({ name, transitioning: result.transitioning, main: read(host.querySelector('.teacher-path-overlay [data-view="comparison"]')!),
        counterpart: getComputedStyle(counterpart).display === 'none' ? null : read(counterpart.querySelector('[data-view="comparison"]')!) });
    };
    try {
      take('spatial', 'space', 'spatial-paths', 'none', 0);
      take('unfold-start', 'parallel', 'parallel', 'unfold-in-place', 0);
      take('unfold-middle', 'parallel', 'parallel', 'unfold-in-place', 600);
      take('parallel', 'parallel', 'parallel', 'unfold-in-place', 1400);
      take('zoom-start', 'fit', 'path-comparison', 'fit-paths', 1400);
      take('zoom-middle', 'fit', 'path-comparison', 'fit-paths', 1790);
      take('reverse-start', 'back', 'parallel', 'unfold-in-place', 1790);
      take('reverse-middle', 'back', 'parallel', 'unfold-in-place', 2390);
      take('reverse-end', 'back', 'parallel', 'unfold-in-place', 3190);
      take('zoom-again', 'fit-again', 'path-comparison', 'fit-paths', 3190);
      take('enlarged', 'fit-again', 'path-comparison', 'fit-paths', 3970);
      take('distance-reveal-start', 'values', 'path-comparison', 'focus', 3970);
      take('distance-reveal', 'values', 'path-comparison', 'focus', 4200);
      take('endpoints-start', 'ends', 'endpoint-comparison', 'focus-endpoints', 4200);
      take('endpoints', 'ends', 'endpoint-comparison', 'focus-endpoints', 4980);
      take('fold-start', 'return', 'spatial-paths', 'fold-to-field', 4980);
      take('fold-middle', 'return', 'spatial-paths', 'fold-to-field', 5630);
      take('fold-end', 'return', 'spatial-paths', 'fold-to-field', 6340);
      take('reduced-split', 'reduced', 'parallel', 'unfold-in-place', 7000, true);
      if (size.mobile) {
        host.querySelector<HTMLButtonElement>('.teacher-reduced-toggle')!.click();
        take('reduced-spatial', 'reduced', 'parallel', 'unfold-in-place', 7000.5, true);
      }
      take('reduced-enlarged', 'reduced-fit', 'path-comparison', 'fit-paths', 7001, true);
      return samples;
    } finally { stage.destroy(); host.remove(); }
  }, stageSize);
  const reference = samples[0].main;
  const parallel = samples.find(sample => sample.name === 'parallel')!.main;
  const middle = samples.find(sample => sample.name === 'zoom-middle')!.main;
  const enlarged = samples.find(sample => sample.name === 'enlarged')!.main;
  if (!stageSize.mobile) {
    expect(middle.rows[0].scale).toBeGreaterThan(parallel.rows[0].scale);
    expect(middle.rows[0].scale).toBeLessThan(enlarged.rows[0].scale);
  }
  expect(samples.find(sample => sample.name === 'reverse-start')!.main).toEqual(middle);
  if (!stageSize.mobile) expect(samples.find(sample => sample.name === 'reduced-split')!.counterpart).not.toBeNull();
  else expect(samples.find(sample => sample.name === 'reduced-split')!.counterpart).toBeNull();
  expect(reference.rows[1].dash).toHaveLength(2);
  for (const sample of samples) {
    for (const actual of [sample.main, sample.counterpart].filter(value => value !== null)) {
      const zoom = actual.rows[0].scale / reference.rows[0].scale;
      if (stageSize.mobile) expect(zoom, sample.name).toBeCloseTo(1, 6);
      expect(actual.time, sample.name).toBe(reference.time);
      actual.rows.forEach((row, index) => {
        const before = reference.rows[index];
        // SVGLength/baseVal uses browser float precision, not JS double precision.
        expect(row.scale / before.scale, sample.name).toBeCloseTo(zoom, 6);
        expect(row.wave, sample.name).toHaveLength(before.wave.length);
        row.wave.forEach((point, i) => {
          // SVG path coordinates are rounded to .001px by the shared renderer.
          expect(point[0], `${sample.name} path ${index} x`).toBeCloseTo(before.wave[i][0], 5);
          expect(point[1], `${sample.name} path ${index} y`).toBeCloseTo(before.wave[i][1], 5);
        });
        row.ink.forEach((value, i) => expect(value / before.ink[i], `${sample.name} path ${index} ink ${i}`).toBeCloseTo(zoom, 4));
        expect(row.dash, sample.name).toHaveLength(before.dash.length);
        row.dash.forEach((value, i) => expect(value / before.dash[i], `${sample.name} dash ${i}`).toBeCloseTo(zoom, 4));
      });
      actual.glyphs.forEach((value, i) => expect(value / reference.glyphs[i], `${sample.name} glyph ${i}`).toBeCloseTo(zoom, 4));
      actual.linkDash.forEach((value, i) => expect(value / reference.linkDash[i], `${sample.name} link dash ${i}`).toBeCloseTo(zoom, 4));
      expect(actual.zeroLength / reference.zeroLength, sample.name).toBeCloseTo(zoom, 5);
    }
  }
});
}

test('frozen teacher scenes remain visible at classroom and phone viewport sizes', async ({ page }) => {
  await page.goto('/?mode=teacher');
  await at(page, 's1-field');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1280, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const cueId of ['s3-parallel', 's4-fit', 's4-values', 's5-sum']) {
      await page.evaluate(async id => {
        // @ts-expect-error Vite serves source modules for this integration fixture.
        const { createTeacherStage, teacherFieldEnvelope } = await import('/src/presentation/stage.ts');
        // @ts-expect-error Vite serves source modules for this integration fixture.
        const { createLessonModel, DEFAULT_LESSON } = await import('/src/lesson/default-lesson.ts');
        // @ts-expect-error Vite serves source modules for this integration fixture.
        const { createRetardedEngine } = await import('/src/physics/retarded-engine.ts');
        const area = document.querySelector('.teacher-stage')!.getBoundingClientRect();
        const host = document.createElement('div');
        host.dataset.frozenPreview = id;
        host.style.cssText = `position:fixed;left:${area.left}px;top:${area.top}px;width:${area.width}px;height:${area.height}px;z-index:9999;flex:none`;
        document.body.append(host);
        const stage = createTeacherStage(host, { invalidate() {} });
        const model = createLessonModel(), engine = createRetardedEngine(model, teacherFieldEnvelope(model.bounds));
        engine.advanceTo(.371);
        const frame = engine.read(model.probe, stage.getFieldBounds(model));
        const cue = DEFAULT_LESSON.scenes.flatMap((scene: { cues: { id: string }[] }) => scene.cues).find((item: { id: string }) => item.id === id);
        stage.render(frame, frame.samplePaths(), cue, { now: 0, playing: false });
        (window as unknown as { cleanupFrozenPreview: () => void }).cleanupFrozenPreview = () => { stage.destroy(); host.remove(); };
      }, cueId);
      try {
        const stage = page.locator('[data-frozen-preview]');
        await expect(stage).toHaveAttribute('data-time-seconds', '0.371');
        await expect(stage.locator('.teacher-path-overlay [data-wave-path="source-1"]')).toBeVisible();
        await expect(stage.locator('.teacher-path-overlay [data-wave-path="source-2"]')).toBeVisible();
        await stage.screenshot({ path: `test-results/teacher-frozen-${viewport.width}x${viewport.height}-${cueId}.png` });
      } finally {
        await page.evaluate(() => (window as unknown as { cleanupFrozenPreview: () => void }).cleanupFrozenPreview());
      }
    }
  }
});
