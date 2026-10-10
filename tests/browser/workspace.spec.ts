import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

async function login(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /创建你的连接空间|欢迎回来/ })).toBeVisible();
  if (await page.getByPlaceholder('验证这个空间属于你').isVisible()) {
    await page.getByPlaceholder('验证这个空间属于你').fill('local-browser-test-secret-not-for-production');
    await page.getByPlaceholder('至少 8 位，包含字母、数字和符号').fill('BrowserTest123!');
    await page.getByPlaceholder('再次输入管理密码').fill('BrowserTest123!');
    await page.getByRole('button', { name: '创建并进入工作台' }).click();
  } else {
    await page.getByPlaceholder('输入你的管理密码').fill('BrowserTest123!');
    await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: '服务器', exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新服务器' })).toBeEnabled();
}

async function navigate(page: Page, name: string) {
  await page
    .locator('nav')
    .getByRole('button', { name: new RegExp(name) })
    .click();
}

test('admin workflow, player payload, subscriptions and scannable QR on desktop and mobile', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '创建你的连接空间' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login-desktop.png', fullPage: true });
  await page.getByPlaceholder('验证这个空间属于你').fill('local-browser-test-secret-not-for-production');
  await page.getByPlaceholder('至少 8 位，包含字母、数字和符号').fill('BrowserTest123!');
  await page.getByPlaceholder('再次输入管理密码').fill('BrowserTest123!');
  await page.getByRole('button', { name: '创建并进入工作台' }).click();
  await expect(page.getByRole('heading', { name: '第一份连接，从这里开始' })).toBeVisible();
  await page.getByRole('button', { name: '添加第一台服务器' }).click();
  await page.getByPlaceholder('例如：家庭媒体库').fill('家庭媒体库');
  await page.getByPlaceholder('一句话介绍这份媒体收藏').fill('家的每一帧，都值得收藏');
  await page.getByPlaceholder('Emby 账号').fill('demo');
  await page.getByPlaceholder('服务器登录密码').fill(' 中文 &+#% ');
  await page.getByPlaceholder('https://media.example.com:8920/emby').fill('https://media.example.com/emby');
  await page.getByRole('button', { name: /添加备用线路/ }).click();
  await page.getByPlaceholder('http://192.168.1.10:8096').fill('http://192.168.1.10:8096');
  await page.getByPlaceholder('例如：家中直连').fill('家中直连');
  await page.getByRole('dialog').getByRole('button', { name: '添加服务器', exact: true }).click();
  await expect(page.locator('.server-title').getByRole('heading', { name: '家庭媒体库' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('服务器已保存');
  await expect(page.locator('.toast')).toBeVisible();
  await page.getByRole('button', { name: '导入播放器' }).click();
  const libraURL = await page.getByRole('link', { name: '打开 Libra' }).getAttribute('href');
  const payload = JSON.parse(
    Buffer.from(new URL(libraURL!).searchParams.get('data')!, 'base64url').toString('utf8'),
  );
  expect(payload.credentials.password).toBe(' 中文 &+#% ');
  expect(payload.alternates[0].name).toBe('家中直连');
  await page.getByRole('button', { name: /SenPlayer/ }).click();
  expect(await page.getByRole('link', { name: '打开 SenPlayer' }).getAttribute('href')).toMatch(
    /^senplayer:\/\/importserver/,
  );
  await page.getByRole('button', { name: /ePlayerX/ }).click();
  expect(await page.getByRole('link', { name: '打开 ePlayerX' }).getAttribute('href')).toMatch(
    /^eplayerx:\/\/add-or-update/,
  );
  await page.getByRole('button', { name: /Hills/ }).click();
  await expect(page.getByRole('alert')).toContainText('基础路径');
  await page.getByRole('button', { name: /小幻播放器/ }).click();
  await expect(page.getByRole('alert')).toContainText('基础路径');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  // Fictional data only, used to inspect populated layouts.
  await page.evaluate(async () => {
    for (const [name, note, host] of [
      ['星河放映室', '把夜晚交给一部好电影', 'cinema.example.com'],
      ['周末纪录片', '总有一个世界，尚未抵达', 'documentary.example.com'],
      ['音乐现场', '留住那些不想散场的夜晚', 'concert.example.com'],
      ['动画收藏馆', '给想象力留一个位置', 'anime.example.com'],
      ['私人影院', '光影之间，自有天地', 'private.example.com'],
    ]) {
      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Libra-Request': '1' },
        body: JSON.stringify({
          config: {
            type: 'emby',
            name,
            note,
            credentials: { username: 'demo' },
            primary: { url: `https://${host}` },
          },
        }),
      });
      if (!response.ok) throw new Error('Fixture creation failed');
    }
  });
  await page.getByRole('button', { name: '刷新服务器' }).click();
  await expect(page.locator('.server-card')).toHaveCount(6);
  await expect(page.locator('.toast')).toBeHidden();
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.getByPlaceholder('搜索名称、地址或账号').fill('家庭');
  await expect(page.locator('.server-card')).toHaveCount(1);
  await page.getByRole('button', { name: '清除搜索' }).click();
  await page.getByRole('button', { name: '列表视图' }).click();
  await expect(page.locator('.server-grid')).toHaveClass(/list-layout/);
  await page.getByRole('button', { name: '卡片视图' }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: /订阅链接/ })
    .click();
  await page.getByRole('button', { name: '创建第一条订阅' }).click();
  await page.getByRole('dialog').getByLabel('订阅名称').fill('我的 iPhone');
  await page
    .getByRole('dialog')
    .getByLabel(/链接后缀/)
    .fill('BrowserFeed123');
  await page.getByRole('button', { name: '创建链接', exact: true }).click();
  await expect(page.locator('.subscription-card')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('订阅链接已保存');
  await expect(page.locator('.toast')).toBeVisible();
  await page.getByRole('button', { name: '二维码', exact: true }).click();
  const qr = page.getByRole('img', { name: '我的 iPhone 的订阅链接二维码' });
  await expect(qr).toBeVisible();
  const source = (await qr.getAttribute('src'))!;
  const png = PNG.sync.read(Buffer.from(source.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe('http://127.0.0.1:8789/BrowserFeed123');
  await page.getByRole('button', { name: '复制链接', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('已复制到剪贴板');
  await expect(page.locator('.toast')).toBeVisible();
  expect(await page.locator('.toast').evaluate((el) => el.matches(':popover-open'))).toBe(true);
  expect(await page.locator('.toast').evaluate((el) => el.parentElement === document.body)).toBe(true);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(decoded!.data);
  await expect(page.locator('.toast')).toBeHidden();
  const feed = await page.request.get(decoded!.data);
  expect(feed.status()).toBe(200);
  expect((await feed.json()).length).toBe(6);
  await page.screenshot({ path: 'test-results/subscription-qr.png', fullPage: true });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载二维码' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('libra-subscription-BrowserFeed123.png');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/subscriptions-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '打开导航' }).click();
  await page
    .locator('nav')
    .getByRole('button', { name: /服务器/ })
    .click();
  await expect(page.locator('.server-card')).toHaveCount(6);
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.screenshot({
    path: 'test-results/workspace-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '编辑 家庭媒体库', exact: true }).click();
  await expect(page.getByPlaceholder('服务器登录密码')).toHaveValue(' 中文 &+#% ');
  await page.screenshot({
    path: 'test-results/server-editor-mobile.png',
    fullPage: false,
    animations: 'disabled',
  });
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
  expect(pageErrors).toEqual([]);
});

test('deleting a selected server cannot block subscription toggles, and delete toasts stay visible', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: '添加服务器', exact: true }).click();
  await page.getByPlaceholder('例如：家庭媒体库').fill('删除回归媒体库');
  await page
    .getByPlaceholder('https://media.example.com:8920/emby')
    .fill('https://regression.example.com/emby');
  await page.getByRole('dialog').getByRole('button', { name: '添加服务器', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('服务器已保存');
  await expect(page.locator('.toast')).toBeVisible();
  await navigate(page, '订阅链接');
  await page.getByRole('button', { name: '创建订阅', exact: true }).click();
  await page.getByRole('dialog').getByLabel('订阅名称').fill('删除回归订阅');
  await page
    .getByRole('dialog')
    .getByLabel(/链接后缀/)
    .fill('RegressionSelected1234');
  await page.getByRole('button', { name: '指定服务器', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: /删除回归媒体库/ })
    .check();
  await page.getByRole('button', { name: '创建链接', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('订阅链接已保存');
  await expect(page.locator('.toast')).toBeVisible();
  await navigate(page, '服务器');
  await page.getByRole('button', { name: '删除 删除回归媒体库', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('服务器已删除');
  await expect(page.locator('.toast')).toBeVisible();
  await navigate(page, '订阅链接');
  const card = page.locator('.subscription-card').filter({ hasText: '删除回归订阅' });
  await expect(card).toContainText('0 台指定服务器');
  await card.getByRole('switch').click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  expect((await page.request.get('/RegressionSelected1234')).status()).toBe(404);
  await card.getByRole('switch').click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  expect(await (await page.request.get('/RegressionSelected1234')).json()).toEqual([]);
  await page.reload();
  await navigate(page, '订阅链接');
  await card.getByRole('switch').click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  // The editor's enable switch must not resubmit a now-empty server selection.
  await card.getByRole('button', { name: '管理链接' }).click();
  await page.getByRole('dialog').getByRole('switch', { name: '启用订阅' }).click();
  await page.getByRole('button', { name: '保存链接', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('订阅链接已保存');
  await expect(page.locator('.toast')).toBeVisible();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  expect(await (await page.request.get('/RegressionSelected1234')).json()).toEqual([]);
  await card.getByRole('button', { name: '删除 删除回归订阅', exact: true }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('订阅已删除');
  await expect(page.locator('.toast')).toBeVisible();
});

test('dirty editor protects backdrop, Escape, close and cancel without prompting after a save', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: '添加服务器', exact: true }).click();
  await page.getByPlaceholder('例如：家庭媒体库').fill('尚未保存的名称');
  const prompts: string[] = [];
  const dismiss = async (dialog: import('@playwright/test').Dialog) => {
    prompts.push(dialog.message());
    await dialog.dismiss();
  };
  page.on('dialog', dismiss);
  await page.mouse.click(3, 3);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(prompts).toEqual(Array(4).fill('有未保存的更改，确定放弃并关闭吗？'));
  await expect(page.getByPlaceholder('例如：家庭媒体库')).toHaveValue('尚未保存的名称');
  await page.getByPlaceholder('https://media.example.com:8920/emby').fill('https://unsaved.example.com');
  await page.getByRole('dialog').getByRole('button', { name: '添加服务器', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('服务器已保存');
  await expect(page.locator('.toast')).toBeVisible();
  expect(prompts).toHaveLength(4);
  page.off('dialog', dismiss);
  await page.getByRole('button', { name: '编辑 尚未保存的名称', exact: true }).click();
  await page.getByPlaceholder('例如：家庭媒体库').fill('确定丢弃的内容');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '尚未保存的名称', exact: true })).toBeVisible();
});

test('HTML error pages, network failures and mismatched secrets produce clear Chinese messages', async ({
  page,
}) => {
  await page.route('**/api/status', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('服务返回了无效响应，请稍后重试');
  await page.unroute('**/api/status');
  await page.route('**/api/status', (route) => route.abort('failed'));
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('无法连接到服务，请检查网络后重试');
  await page.unroute('**/api/status');
  await page.route('**/api/status', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: 'DEPLOYMENT_KEY_MISMATCH',
        error: '部署密钥与已有数据不匹配，或数据已损坏。请恢复原来的 APP_SECRET 后重新部署。',
      },
    }),
  );
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('部署密钥与已有数据不匹配');
});
