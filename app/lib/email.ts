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
    from: 'New Overlord <onboarding@resend.dev>',
    to,
    subject,
    text,
  })

  if (error) throw error
  return data
}