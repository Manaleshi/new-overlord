import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string
  subject: string
  text: string
}) {
  const { data, error } = await resend.emails.send({
    from: 'New Overlord <orders@new-overlord.us>',
    to,
    subject,
    text,
  })

  if (error) {
    console.error('Email send error:', error)
    throw error
  }

  console.log('Email sent:', data?.id)
  return data
}