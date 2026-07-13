// Service worker for Web Push. Kept dependency-free and at the site root so its
// scope covers the whole app. Registered by lib/push/client.ts.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'New notification'
  const options = {
    body: data.body || '',
    icon: data.icon || '/brand.jpg',
    badge: data.badge || '/brand.jpg',
    tag: data.tag,
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url =
    (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab if one is open, navigating it to the target.
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      }),
  )
})
