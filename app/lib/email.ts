import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string
  subject: string
  text: string
}) {
  try {
    const info = await transporter.sendMail({
      from: `New Overlord <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    })
    console.log('Email sent:', info.messageId)
    return info
  } catch (err) {
    console.error('Email send error:', err)
    throw err
  }
}