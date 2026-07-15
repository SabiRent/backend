import { MAIL_HOST, MAIL_PASS, MAIL_PORT, MAIL_USER } from '@/config/env.config';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
});

export default transporter;
