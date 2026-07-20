import imapSimple from 'imap-simple'
import { simpleParser } from 'mailparser'

export async function checkGmailInbox(): Promise<{ from: string; subject: string; body: string }[]> {
  const config = {
    imap: {
      user: process.env.GMAIL_USER!,
      password: process.env.GMAIL_APP_PASSWORD!,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    }
  }

  const connection = await imapSimple.connect(config)
  await connection.openBox('INBOX')

  // Search for unread emails
  const searchCriteria = ['UNSEEN']
  const fetchOptions = {
    bodies: ['HEADER', 'TEXT', ''],
    markSeen: true,
  }

  const messages = await connection.search(searchCriteria, fetchOptions)
  const emails: { from: string; subject: string; body: string }[] = []

  for (const message of messages) {
    const all = message.parts.find(p => p.which === '')
    if (!all) continue

    const parsed = await simpleParser(all.body)
    const from = parsed.from?.value?.[0]?.address ?? ''
    const subject = parsed.subject ?? ''
    const body = parsed.text ?? (parsed.html || '')

    emails.push({ from, subject, body })
  }

  connection.end()
  return emails
}