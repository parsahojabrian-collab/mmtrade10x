#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path("/root/miniapp10x")
API = ROOT / "apps/api/src/index.ts"
ADMIN = ROOT / "apps/api/public/admin.html"

if not API.exists() or not ADMIN.exists():
    sys.exit("ERROR: Project files not found.")

api = API.read_text(encoding="utf-8")
admin = ADMIN.read_text(encoding="utf-8")
changes = []

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{label}: expected 1 match, found {count}"
        )
    changes.append(label)
    return text.replace(old, new, 1)

try:
    # 1. Default configuration
    if "miniAppBaseUrl:" not in api:
        match = re.search(
            r"(const\s+defaultBotConfig\s*=\s*\{"
            r"[\s\S]*?welcomeMessage\s*:\s*[^,\n]+,)",
            api
        )

        if not match:
            raise RuntimeError("defaultBotConfig not found")

        addition = """
  miniAppBaseUrl: 'https://mmtrade.parsahojabrian.ir',
  pagePaths: {
    index: '/miniapp',
    academy: '/academy',
    crypto: '/crypto',
    'copy-trading': '/copy-trading',
    challenge: '/challenge',
    support: '/support',
    profile: '/profile'
  },"""

        api = (
            api[:match.end()]
            + addition
            + api[match.end():]
        )
        changes.append("default config")

    # 2. Config reader
    if "pagePaths: saved.pagePaths" not in api:
        anchor = """welcomeMessage: typeof saved.welcomeMessage === 'string'
      ? saved.welcomeMessage.slice(0, 2000)
      : defaultBotConfig.welcomeMessage,"""

        api = replace_once(
            api,
            anchor,
            anchor + """
    miniAppBaseUrl: typeof saved.miniAppBaseUrl === 'string'
      ? saved.miniAppBaseUrl.slice(0, 300)
      : defaultBotConfig.miniAppBaseUrl,
    pagePaths: saved.pagePaths &&
      typeof saved.pagePaths === 'object' &&
      !Array.isArray(saved.pagePaths)
      ? saved.pagePaths
      : defaultBotConfig.pagePaths,""",
            "config reader"
        )

    # 3. PUT schema
    if "pagePaths: z.object({" not in api:
        anchor = (
            "welcomeMessage: "
            "z.string().trim().min(1).max(2000),"
        )

        api = replace_once(
            api,
            anchor,
            anchor + """
    miniAppBaseUrl: z.string().trim().url().max(300),
    pagePaths: z.object({
      index: z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160),
      academy: z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160),
      crypto: z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160),
      'copy-trading': z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160),
      challenge: z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160),
      support: z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160),
      profile: z.string().regex(/^\\/[a-zA-Z0-9/_-]+$/).max(160)
    }).strict(),""",
            "PUT schema"
        )

    # 4. Find parser and validation guard
    if "const pageSlugs = ['index', 'academy'" not in api:
        match = re.search(
            r"const\s+(\w+)\s*=\s*\w+\.safeParse\(request\.body\);"
            r"[\s\S]{0,500}?if\s*\(!\1\.success\)\s*\{"
            r"[\s\S]*?\}",
            api
        )

        if not match:
            raise RuntimeError(
                "Could not locate safeParse validation block"
            )

        parsed = match.group(1)

        validation = f"""

    const pageSlugs = [
      'index', 'academy', 'crypto',
      'copy-trading', 'challenge', 'support', 'profile'
    ] as const;

    const paths = {parsed}.data.pagePaths;
    const pathValues = pageSlugs.map(
      (slug) => paths[slug]
    );

    const reservedPaths = new Set([
      '/admin',
      '/admin/control',
      '/miniapp',
      '/health',
      '/api'
    ]);

    if (
      new Set(pathValues).size !== pathValues.length ||
      pathValues.some(
        (path) =>
          reservedPaths.has(path) ||
          path.startsWith('/admin/')
      )
    ) {{
      return reply.code(400).send({{
        success: false,
        error: 'مسیر صفحات باید یکتا باشد و با مسیرهای رزروشده تداخل نداشته باشد.'
      }});
    }}
"""

        api = (
            api[:match.end()]
            + validation
            + api[match.end():]
        )
        changes.append("path validation")
    else:
        parsed = "parsed"

    # 5. Synchronize existing settings
    if "key: 'MINI_APP_URL'" not in api:
        put_pos = api.find("app.put('/admin/bot/config'")

        if put_pos < 0:
            put_pos = api.find(
                'app.put("/admin/bot/config"'
            )

        if put_pos < 0:
            raise RuntimeError(
                "PUT /admin/bot/config not found"
            )

        upsert = re.search(
            r"await\s+prisma\.systemSetting\.upsert\("
            r"\{[\s\S]{0,1200}?BOT_CONFIG_KEY"
            r"[\s\S]{0,1200}?\}\);",
            api[put_pos:]
        )

        if not upsert:
            raise RuntimeError(
                "BOT_CONTROL_CONFIG upsert not found"
            )

        end = put_pos + upsert.end()

        sync = f"""

    await Promise.all([
      prisma.systemSetting.upsert({{
        where: {{ key: 'MINI_APP_URL' }},
        update: {{ value: {parsed}.data.miniAppBaseUrl }},
        create: {{
          key: 'MINI_APP_URL',
          value: {parsed}.data.miniAppBaseUrl
        }}
      }}),

      ...pageSlugs.map((slug) =>
        prisma.systemSetting.upsert({{
          where: {{ key: `PAGE_PATH_${{slug}}` }},
          update: {{ value: paths[slug] }},
          create: {{
            key: `PAGE_PATH_${{slug}}`,
            value: paths[slug]
          }}
        }})
      )
    ]);
"""

        api = api[:end] + sync + api[end:]
        changes.append("settings synchronization")

    # 6. Admin UI fields
    if 'id="tbc-base-url"' not in admin:
        pos = admin.find(
            '<textarea id="tbc-welcome"'
        )

        if pos < 0:
            raise RuntimeError(
                "tbc-welcome textarea not found"
            )

        end = admin.find("</textarea>", pos)

        if end < 0:
            raise RuntimeError(
                "welcome textarea closing tag not found"
            )

        end += len("</textarea>")

        ui = """

<hr>
<h3>آدرس Mini App و مسیر صفحات</h3>

<label>آدرس اصلی Mini App</label>
<input
  id="tbc-base-url"
  type="url"
  placeholder="https://mmtrade.parsahojabrian.ir"
  style="width:100%;display:block"
>

<div
  id="tbc-page-paths"
  style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px"
></div>

<p style="font-size:12px;opacity:.7">
  مسیرها باید با / شروع شوند و تکراری نباشند.
</p>
<hr>
"""

        admin = admin[:end] + ui + admin[end:]
        changes.append("admin fields")

    # 7. Load values into admin UI
    if "const pageNames =" not in admin:
        anchor = (
            "document.getElementById('tbc-welcome').value="
            "tenxConfig.welcomeMessage||'';"
        )

        load_code = anchor + """
   document.getElementById('tbc-base-url').value =
    tenxConfig.miniAppBaseUrl ||
    'https://mmtrade.parsahojabrian.ir';

   tenxConfig.pagePaths = tenxConfig.pagePaths || {};

   const pathRoot =
    document.getElementById('tbc-page-paths');

   pathRoot.replaceChildren();

   const pageNames = {
    index: 'صفحه اصلی',
    academy: 'آکادمی',
    crypto: 'ارز دیجیتال',
    'copy-trading': 'کپی تریدینگ',
    challenge: 'چالش',
    support: 'پشتیبانی',
    profile: 'پروفایل'
   };

   Object.entries(pageNames).forEach(([slug, label]) => {
    const wrap = document.createElement('label');
    wrap.style.display = 'block';

    const caption = document.createElement('span');
    caption.textContent = label;
    caption.style.cssText =
      'display:block;font-size:12px;margin-bottom:4px';

    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText =
      'width:100%;box-sizing:border-box';

    input.value =
      tenxConfig.pagePaths[slug] ||
      (slug === 'index' ? '/miniapp' : '/' + slug);

    input.addEventListener('input', () => {
      tenxConfig.pagePaths[slug] = input.value.trim();
    });

    wrap.append(caption, input);
    pathRoot.appendChild(wrap);
   });
"""

        admin = replace_once(
            admin,
            anchor,
            load_code,
            "admin load function"
        )

    # 8. Save fields with existing config
    if (
        "miniAppBaseUrl:document.getElementById('tbc-base-url')"
        not in admin
    ):
        anchor = (
            "welcomeMessage:document.getElementById('tbc-welcome').value.trim(),"
        )

        admin = replace_once(
            admin,
            anchor,
            anchor + """
   miniAppBaseUrl:
    document.getElementById('tbc-base-url').value.trim(),
   pagePaths: tenxConfig.pagePaths,
""",
            "admin save payload"
        )

    # Write only after all checks have passed.
    API.write_text(api, encoding="utf-8")
    ADMIN.write_text(admin, encoding="utf-8")

    print("PATCH_APPLIED")
    print("Updated:", ", ".join(changes))
    print("No backup created.")
    print("Next: npm run build")

except Exception as error:
    print("PATCH_ABORTED:", error)
    print("No source files were written.")
    sys.exit(1)

ad_text(encoding="utf-8")
N.read_text(encoding="utf-8")


once(text, old, new, label):
text.count(old)
 != 1:
e RuntimeError(
f"{label}: expected 1 match, found {count}"

append(label)
ext.replace(old, new, 1)


ault configuration
AppBaseUrl:" not in api:
h = re.search(
r"(const\s+defaultBotConfig\s*=\s*\{"
r"[\s\S]*?welcomeMessage\s*:\s*[^,\n]+,)",
api


ot match:
raise RuntimeError("defaultBotConfig not fo

tion = """
eUrl: 'https://mmtrade.parsahojabrian.ir',
 {
/miniapp',
 '/academy',
'/crypto',
ading': '/copy-trading',
e: '/challenge',
 '/support',
