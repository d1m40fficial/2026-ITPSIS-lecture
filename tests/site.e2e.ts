import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Course } from '@olgakraven/lecture-engine'
const course: Course = JSON.parse(readFileSync('public/course.json', 'utf8'))
const bank = JSON.parse(readFileSync('public/assessment.json', 'utf8'))
const access = JSON.parse(readFileSync('public/access-codes.json', 'utf8'))

// Коды преподавателя не публикуются. Локально тесты используют его файл,
// в CI — тестовый набор из tests/fixtures. В CI проверяется всё, кроме входа по настоящему коду.
const codesPath = existsSync('config/access-codes.json') ? 'config/access-codes.json' : 'tests/fixtures/access-codes.json'
const teacherCodes = JSON.parse(readFileSync(codesPath, 'utf8'))
const plaintextAvailable = codesPath.startsWith('config/')
const sha256 = (value: string) => createHash('sha256').update(value.trim().toUpperCase().replace(/[^0-9A-Z]/g, ''), 'utf8').digest('hex')
const codeOf = (id: string) => (plaintextAvailable ? teacherCodes.lectures[id][0] : '')
const masterOf = () => (plaintextAvailable ? teacherCodes.releaseCode : '')
const hashOf = (id: string) => (plaintextAvailable ? sha256(codeOf(id)) : sha256(`synthetic-${id}`))

const unlock = async (page: import('@playwright/test').Page, lectureId: string) => {
  if (!page.url().startsWith('http')) await page.goto('./')
  await page.evaluate(([id, hash]) => {
    localStorage.setItem('lecture:/2026-ITPSIS-lecture/:itpsis:unlocked', JSON.stringify({ [id]: { hash, at: Date.now() } }))
  }, [lectureId, hashOf(lectureId)])
}

test('catalog, search and no semester division or teacher-only controls', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.topic-card')).toHaveCount(15)
  await expect(page.getByRole('button', { name: 'Все темы', exact: true })).toHaveCount(0)
  await expect(page.locator('.semester-filter,.semester-tag')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Настройка перед занятием', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Прикрепить материалы', exact: true })).toHaveCount(0)
  await expect(page.locator('.topic-card').first().locator('.locked-tag')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить PDF', exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Поиск по темам' }).fill('резервного')
  await expect(page.locator('.topic-card')).toHaveCount(1)
})

test('responsive catalog and slides fit wide, laptop and mobile screens', async ({ page }) => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 800 }]) {
    await page.setViewportSize(viewport)
    await page.goto('./')
    await expect(page.locator('.topic-card')).toHaveCount(15)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    const lecture = course.lectures[0]
    for (const kind of ['title', 'theory', 'notebook', 'process', 'test']) {
      const slide = lecture.slides.find(s => s.kind === kind)!
      await unlock(page, lecture.id)
      await page.goto(`./?lecture=${lecture.id}&slide=${slide.id}`)
      await expect(page.locator('.active-slide .slide-frame')).toHaveAttribute('data-slide-id', slide.id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
    }
  }
})

test('legacy links, keyboard navigation, stable IDs and end navigation', async ({ page }) => {
  const l = course.lectures[0]
  await unlock(page, l.id)
  await page.goto(`./?topic=${l.id}&slide=1`)
  await expect(page.locator('.slide-counter')).toHaveText(`1 / ${l.slides.length}`)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.slide-counter')).toHaveText(`2 / ${l.slides.length}`)
  await page.reload()
  await expect(page.locator('.slide-counter')).toHaveText(`2 / ${l.slides.length}`)
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: 'Вперёд', exact: true })).toBeDisabled()
  await page.goto('./?topic=unknown&slide=900')
  await expect(page.locator('.notice')).toContainText('Лекция не найдена')
  await expect(page.locator('.topic-card')).toHaveCount(15)
})

test('all print pages fit their regions and have no private notes or attempts', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  for (const l of course.lectures) {
    await page.goto(`./?mode=print&scope=${l.id}`)
    await expect(page.locator('.print-page')).toHaveCount(l.slides.length)
    await page.evaluate(() => document.fonts.ready)
    const problems = await page.locator('.slide-frame').evaluateAll(nodes => nodes.flatMap(e => {
      const bad = [...e.querySelectorAll<HTMLElement>('.slide-copy,.slide-content,.public-task,td')].filter(x => x.scrollHeight > x.clientHeight + 3 || x.scrollWidth > x.clientWidth + 3).map(x => ({ id: e.getAttribute('data-slide-id'), type: x.className }))
      for (const svg of e.querySelectorAll('svg')) for (const text of svg.querySelectorAll('text')) {
        const r = text.getBBox(), b = svg.viewBox.baseVal
        if (r.x < -2 || r.y < -2 || r.x + r.width > b.width + 2 || r.y + r.height > b.height + 2 || (svg.closest('.infographic-process') && r.y > 150 && r.y + r.height > 307)) bad.push({ id: e.getAttribute('data-slide-id'), type: 'svg-text' })
      }
      return bad
    }))
    expect(problems, l.id).toEqual([])
    await expect(page.locator('.interactive-task,.note-reader,.task-status')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('ITPSIS_PRIVATE_SCRIPT_20260912')
  }
})

test('four assessment types, empty attempt, retry and restoration', async ({ page }) => {
  const l = course.lectures[0]
  await unlock(page, l.id)
  for (const s of l.slides.filter(s => s.task).slice(0, 4)) {
    const t = s.task!, key = bank.keys[t.id]
    await page.goto(`./?lecture=${l.id}&slide=${s.id}`)
    await page.getByRole('button', { name: 'Проверить', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ещё попытка', exact: true })).toHaveCount(0)
    if (t.type === 'single' || t.type === 'multiple') {
      for (const id of key.correct) await page.locator('.choice-grid label').filter({ hasText: t.options!.find(o => o.id === id)!.text }).locator('input').check()
    } else if (t.type === 'short') await page.locator('.short-field input').fill(key.accepted[0])
    else for (const [i, item] of t.items!.entries()) await page.locator('.matching-fields select').nth(i).selectOption(key.pairs[item.id])
    await page.getByRole('button', { name: 'Проверить', exact: true }).click()
    await expect(page.locator('.task-status')).toContainText('Правильно')
    await page.reload()
    await expect(page.locator('.task-status')).toContainText('Правильно')
    await page.getByRole('button', { name: 'Ещё попытка', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Проверить', exact: true })).toBeVisible()
  }
})

test('locked lecture rejects a wrong code and never shows slides', async ({ page }) => {
  const l = course.lectures[0]
  expect(access.lectures[l.id]?.length).toBeGreaterThan(0)
  await page.goto('./')
  const card = page.locator('.topic-card', { hasText: l.sourceTitle }).first()
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Доступ к лекции' })).toBeVisible()
  await expect(page.locator('.active-slide')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Код доступа' }).fill('WRONG-CODE-000')
  await page.getByRole('button', { name: 'Открыть лекцию', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Код не подходит')
  await expect(page.locator('.active-slide')).toHaveCount(0)
})

test('teacher code opens the lecture once and stays open', async ({ page }) => {
  test.skip(!plaintextAvailable, 'настоящие коды доступны только при файле преподавателя')
  const l = course.lectures[0]
  await page.goto('./')
  const card = page.locator('.topic-card', { hasText: l.sourceTitle }).first()
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await page.getByRole('textbox', { name: 'Код доступа' }).fill(codeOf(l.id))
  await page.getByRole('button', { name: 'Открыть лекцию', exact: true }).click()
  await expect(page.locator('.active-slide .slide-frame')).toBeVisible()
  await page.getByRole('button', { name: 'Каталог', exact: true }).click()
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.locator('.active-slide .slide-frame')).toBeVisible()
})

test('releasing access requires the teacher master code', async ({ page }) => {
  const l = course.lectures[0]
  await page.goto('./')
  const card = page.locator('.topic-card', { hasText: l.sourceTitle }).first()
  await unlock(page, l.id)
  await page.reload()
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.locator('.active-slide .slide-frame')).toBeVisible()
  await page.getByRole('button', { name: 'Каталог', exact: true }).click()
  await card.getByRole('button', { name: 'Освободить доступ', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Освободить доступ' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Мастер-код' }).fill('WRONG-MASTER-0')
  await page.getByRole('button', { name: 'Снять доступ', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Мастер-код не подходит')
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.locator('.active-slide .slide-frame')).toBeVisible()
})

test('master code clears access and lets the next student enter their own name', async ({ page }) => {
  test.skip(!plaintextAvailable, 'настоящие коды доступны только при файле преподавателя')
  const l = course.lectures[0]
  const bank = JSON.parse(readFileSync('public/assessment.json', 'utf8'))
  await page.goto('./')
  const card = page.locator('.topic-card', { hasText: l.sourceTitle }).first()
  const sign = async (name: string) => {
    const s = l.slides.find(x => x.task)!
    const t = s.task!, key = bank.keys[t.id]
    await page.goto(`./?lecture=${l.id}&slide=${s.id}`)
    // Попытка могла сохраниться от первого студента — начинаем заново.
    const retry = page.getByRole('button', { name: 'Ещё попытка', exact: true })
    if (await retry.count()) await retry.click()
    if (t.type === 'single' || t.type === 'multiple') {
      for (const id of key.correct) await page.locator('.choice-grid label').filter({ hasText: t.options!.find(o => o.id === id)!.text }).locator('input').check()
    } else if (t.type === 'short') await page.locator('.short-field input').fill(key.accepted[0])
    else for (const [i, item] of t.items!.entries()) await page.locator('.matching-fields select').nth(i).selectOption(key.pairs[item.id])
    await page.getByRole('button', { name: 'Проверить', exact: true }).click()
    await page.getByRole('button', { name: 'Результаты самопроверки', exact: true }).click()
    await page.getByRole('textbox', { name: 'ФИО студента' }).fill(name)
    await page.getByRole('button', { name: 'Подписать результат', exact: true }).click()
    await expect(page.getByTestId('certificate-name')).toHaveText(name)
  }
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await page.getByRole('textbox', { name: 'Код доступа' }).fill(codeOf(l.id))
  await page.getByRole('button', { name: 'Открыть лекцию', exact: true }).click()
  await page.locator('.active-slide .slide-frame').waitFor()
  await sign('Первый Студент Первыйович')
  await page.goto('./')
  await card.getByRole('button', { name: 'Освободить доступ', exact: true }).click()
  await page.getByRole('textbox', { name: 'Мастер-код' }).fill(masterOf())
  await page.getByRole('button', { name: 'Снять доступ', exact: true }).click()
  await expect(page.locator('.floating-notice')).toContainText('сняты')
  await page.goto('./')
  await card.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Доступ к лекции' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Код доступа' }).fill(codeOf(l.id))
  await page.getByRole('button', { name: 'Открыть лекцию', exact: true }).click()
  await page.locator('.active-slide .slide-frame').waitFor()
  await sign('Второй Студент Вторович')
})

test('access granted more than a week ago asks for the code again', async ({ page }) => {
  const l = course.lectures[1]
  await page.goto('./')
  await page.evaluate(([id, hash]) => {
    const stale = Date.now() - 8 * 86_400_000
    localStorage.setItem('lecture:/2026-ITPSIS-lecture/:itpsis:unlocked', JSON.stringify({ [id]: { hash, at: stale } }))
  }, [l.id, hashOf(l.id)])
  await page.reload()
  await page.locator('.topic-card', { hasText: l.sourceTitle }).first().getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Доступ к лекции' })).toBeVisible()
})

test('direct link to a locked lecture asks for the code', async ({ page }) => {
  const l = course.lectures[2]
  await page.goto(`./?lecture=${l.id}&slide=${l.slides[0].id}`)
  await expect(page.getByRole('dialog', { name: 'Доступ к лекции' })).toBeVisible()
  await expect(page.locator('.active-slide')).toHaveCount(0)
})

test('self-check result carries the student name in a signature', async ({ page }) => {
  const l = course.lectures[0]
  await unlock(page, l.id)
  const s = l.slides.find(x => x.task)!
  const t = s.task!, key = bank.keys[t.id]
  await page.goto(`./?lecture=${l.id}&slide=${s.id}`)
  if (t.type === 'single' || t.type === 'multiple') {
    for (const id of key.correct) await page.locator('.choice-grid label').filter({ hasText: t.options!.find(o => o.id === id)!.text }).locator('input').check()
  } else if (t.type === 'short') await page.locator('.short-field input').fill(key.accepted[0])
  else for (const [i, item] of t.items!.entries()) await page.locator('.matching-fields select').nth(i).selectOption(key.pairs[item.id])
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await page.getByRole('button', { name: 'Результаты самопроверки', exact: true }).click()
  await expect(page.locator('.certificate-block')).toBeVisible()
  await page.getByRole('textbox', { name: 'ФИО студента' }).fill('Петров Пётр Петрович')
  await page.getByRole('button', { name: 'Подписать результат', exact: true }).click()
  await expect(page.getByTestId('certificate-name')).toHaveText('Петров Пётр Петрович')
  expect(await page.getByTestId('certificate-signature').innerText()).toMatch(/^[0-9A-Z]{24}$/)
  await page.reload()
  await page.getByRole('button', { name: 'Результаты самопроверки', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'ФИО студента' })).toBeDisabled()
})