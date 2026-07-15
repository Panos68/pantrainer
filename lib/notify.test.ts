import assert from 'node:assert/strict'

// notify.ts guards on `typeof window !== 'undefined'`, `'Notification' in window`,
// `Notification.permission`, and `document.visibilityState`. Plain Node has none
// of these globals, so we stub them per-test to exercise the guard branches
// without a real browser. The guards are evaluated at call time (not module
// load time), so a single import is fine.
import { requestNotificationPermission, notifyTimerDone } from './notify'

function withStubbedGlobals<T>(stubs: Record<string, unknown>, fn: () => T): T {
  const originals: Record<string, unknown> = {}
  for (const key of Object.keys(stubs)) {
    originals[key] = (globalThis as any)[key]
    ;(globalThis as any)[key] = stubs[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(stubs)) {
      if (originals[key] === undefined) delete (globalThis as any)[key]
      else (globalThis as any)[key] = originals[key]
    }
  }
}

function testRequestPermissionNoopsWithoutWindow() {
  delete (globalThis as any).window
  assert.doesNotThrow(() => requestNotificationPermission())
}

function testRequestPermissionCallsWhenDefault() {
  let requested = false
  const NotificationStub: any = {
    permission: 'default',
    requestPermission: () => {
      requested = true
      return Promise.resolve('granted')
    },
  }
  withStubbedGlobals({ window: { Notification: NotificationStub }, Notification: NotificationStub }, () => {
    requestNotificationPermission()
  })
  assert.equal(requested, true, 'should call Notification.requestPermission when permission is default')
}

function testRequestPermissionSkipsWhenAlreadyDecided() {
  let requested = false
  const NotificationStub: any = {
    permission: 'denied',
    requestPermission: () => {
      requested = true
      return Promise.resolve('denied')
    },
  }
  withStubbedGlobals({ window: { Notification: NotificationStub }, Notification: NotificationStub }, () => {
    requestNotificationPermission()
  })
  assert.equal(requested, false, 'should not re-request permission once denied/granted')
}

function testNotifyTimerDoneSkipsWhenVisible() {
  let created = false
  class FakeNotification {
    static permission = 'granted'
    constructor() {
      created = true
    }
  }
  withStubbedGlobals(
    { window: { Notification: FakeNotification }, Notification: FakeNotification, document: { visibilityState: 'visible' } },
    () => {
      notifyTimerDone('Test')
    },
  )
  assert.equal(created, false, 'should not create a Notification while the tab is visible')
}

function testNotifyTimerDoneFiresWhenHidden() {
  let created = false
  class FakeNotification {
    static permission = 'granted'
    constructor() {
      created = true
    }
  }
  withStubbedGlobals(
    { window: { Notification: FakeNotification }, Notification: FakeNotification, document: { visibilityState: 'hidden' } },
    () => {
      notifyTimerDone('Test')
    },
  )
  assert.equal(created, true, 'should create a Notification while the tab is hidden and permission is granted')
}

function testNotifyTimerDoneSkipsWithoutPermission() {
  let created = false
  class FakeNotification {
    static permission = 'default'
    constructor() {
      created = true
    }
  }
  withStubbedGlobals(
    { window: { Notification: FakeNotification }, Notification: FakeNotification, document: { visibilityState: 'hidden' } },
    () => {
      notifyTimerDone('Test')
    },
  )
  assert.equal(created, false, 'should not create a Notification without granted permission')
}

testRequestPermissionNoopsWithoutWindow()
testRequestPermissionCallsWhenDefault()
testRequestPermissionSkipsWhenAlreadyDecided()
testNotifyTimerDoneSkipsWhenVisible()
testNotifyTimerDoneFiresWhenHidden()
testNotifyTimerDoneSkipsWithoutPermission()
console.log('lib/notify.test.ts: all assertions passed')
