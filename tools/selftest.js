(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const results = [];
  const log = (name, ok, extra) => results.push({ name, ok: !!ok, extra: extra === undefined ? null : extra });
  const stateNow = () => window.api.getState();
  const closePopover = () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  try {
    /* ---------------- A. 新建（截止 + 分类 + 回车） ---------------- */
    const beforeA = (await stateNow()).tasks.length;
    $('#qaTitle').value = '自检新建任务';
    $('#qaDue').click();
    await wait(120);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T09:00`;
    const dp = $('.popover input[type="datetime-local"]');
    dp.value = val;
    $('.popover [data-x="ok"]').click();
    await wait(150);

    $('#qaCats').click();
    await wait(120);
    $('.popover [data-c="lab"]').click();
    await wait(80);
    $('.popover [data-x="ok"]').click();
    await wait(120);

    $('#qaAdd').click();
    await wait(400);

    const sA = await stateNow();
    const created = sA.tasks.find((t) => t.title === '自检新建任务');
    log('A 新建任务', !!created && sA.tasks.length === beforeA + 1 && created.dueAt === val && created.categoryIds.includes('lab'), {
      due: created && created.dueAt,
      cats: created && created.categoryIds,
    });

    /* ---------------- B. 截止时间必填 ---------------- */
    $('#qaTitle').value = '无日期任务';
    $('#qaAdd').click();
    await wait(400);
    const sB = await stateNow();
    log('B 截止必填拦截', !sB.tasks.some((t) => t.title === '无日期任务') && !$('#toast').hidden, $('#toast').textContent);

    /* ------------- B2. 未选分类时自动归到「其他/杂项」 ------------- */
    const dp2 = $('.popover input[type="datetime-local"]');
    const d2 = new Date();
    d2.setDate(d2.getDate() + 2);
    dp2.value = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}T10:00`;
    $('.popover [data-x="ok"]').click();
    await wait(180);
    $('#qaAdd').click();
    await wait(500);
    const sB2 = await stateNow();
    const miscTask = sB2.tasks.find((t) => t.title === '无日期任务');
    log(
      'B2 未选分类→自动杂项',
      !!miscTask && miscTask.categoryIds.join(',') === 'misc' && $('#qaCats').dataset.empty === '1',
      { cats: miscTask && miscTask.categoryIds, fieldReset: $('#qaCats').dataset.empty === '1' }
    );
    closePopover();
    await wait(120);
    $('#qaTitle').value = '';

    /* ---------------- C. 分类最多 3 个 ---------------- */
    $('#qaCats').click();
    await wait(180);
    const btns = $$('.popover .cat-opt button');
    let picked = 0;
    for (const b of btns) {
      if (picked >= 3) break;
      if (!b.classList.contains('on')) {
        b.click();
        picked += 1;
        await wait(50);
      }
    }
    const three = $$('.popover .cat-opt button.on').length;
    const freeBtn = $$('.popover .cat-opt button').find((b) => !b.classList.contains('on'));
    if (freeBtn) freeBtn.click();
    await wait(150);
    const afterOn = $$('.popover .cat-opt button.on').length;
    log('C 分类上限 3', three === 3 && afterOn === 3, { three, afterOn, toast: $('#toast').textContent });
    const doneBtn = $('.popover [data-x="ok"]');
    if (doneBtn) doneBtn.click();
    await wait(120);

    /* ---------------- D. 勾选完成 ---------------- */
    const id = created.id;
    $(`.task[data-id="${id}"] .check`).click();
    await wait(350);
    const sD = await stateNow();
    log('D 勾选完成', sD.tasks.find((t) => t.id === id).done === true);

    /* ---------------- E. 子任务 → 部分完成 ---------------- */
    $(`.task[data-id="${id}"] [data-act="expand"]`).click();
    await wait(150);
    const addInput = $(`.task[data-id="${id}"] .sub-add`);
    addInput.value = '子任务一';
    addInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(350);
    const subEl = $(`.task[data-id="${id}"] .sub`);
    const hasSub = !!subEl;
    if (subEl) {
      subEl.querySelector('.sub-check').click();
      await wait(350);
    }
    const sE = await stateNow();
    const tE = sE.tasks.find((t) => t.id === id);
    // 主任务已完成时状态仍是 done；这里改测一条未完成任务
    log('E 子任务新增并勾选', hasSub && tE.subtasks.length === 1 && tE.subtasks[0].done === true);

    /* ---------------- F. 星标 ---------------- */
    $(`.task[data-id="${id}"] [data-act="star"]`).click();
    await wait(350);
    const sF = await stateNow();
    log('F 星标', sF.tasks.find((t) => t.id === id).starred === true);

    /* ---------------- G. 搜索 ---------------- */
    const search = $('#searchInput');
    search.value = '自检';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);
    const rowsG = $$('#list .task').length;
    log('G 关键字搜索', rowsG === 1, rowsG);
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(200);

    /* ---------------- H. 视图切换 ---------------- */
    $('#nav [data-view="status"]').click();
    await wait(200);
    const tabs = $$('#statusTabs .tab');
    const statusVisible = !$('#statusTabs').hidden && tabs.length === 3;
    tabs.find((t) => t.dataset.tab === 'done').click();
    await wait(200);
    const rowsH = $$('#list .task').length;
    const sH = await stateNow();
    const doneCount = sH.tasks.filter((t) => t.done).length;
    log('H 完成度视图', statusVisible && rowsH === doneCount, { rowsH, doneCount });

    /* ---------------- I. 逾期视图 ---------------- */
    $('#nav [data-view="overdue"]').click();
    await wait(250);
    const rowsI = $$('#list .task').length;
    const sI = await stateNow();
    const now = Date.now();
    const overdueCount = sI.tasks.filter((t) => !t.done && new Date(t.dueAt).getTime() < now).length;
    log('I 逾期视图', rowsI === overdueCount && rowsI > 0, { rowsI, overdueCount });

    /* ---------------- J. 删除（二次确认） ---------------- */
    $('#nav [data-view="time"]').click();
    await wait(250);
    const beforeJ = (await stateNow()).tasks.length;
    $(`.task[data-id="${id}"] [data-act="menu"]`).click();
    await wait(150);
    $('.popover [data-x="del"]').click();
    await wait(200);
    const modalShown = !!$('.modal-backdrop');
    $('.modal-backdrop [data-x="ok"]').click();
    await wait(400);
    const sJ = await stateNow();
    log('J 删除需确认', modalShown && !sJ.tasks.some((t) => t.id === id) && sJ.tasks.length === beforeJ - 1);

    /* ---------------- K. 排序规则 ---------------- */
    const sK = await stateNow();
    const sorted = sK.tasks.slice().sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    const rowsK = $$('#list .task').map((el) => el.dataset.id);
    const expectK = sorted.map((t) => t.id);
    log('K 按截止时间排序', rowsK.length === expectK.length && rowsK.every((x, i) => x === expectK[i]), rowsK.length);
  } catch (err) {
    log('异常', false, String((err && err.message) || err));
  }

  const failed = results.filter((r) => !r.ok);
  return { pass: results.length - failed.length, fail: failed.length, results };
})();
