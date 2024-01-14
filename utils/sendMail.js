const nodemailer =  require('nodemailer');


const sendEmail = async options => {
    const transporter = nodemailer.createTransport({
        host: "sandbox.smtp.mailtrap.io",
        port: 2525,
        auth:{
            user: "ad9b7c7e3b8c91",
            pass: "056caedff56a26"
        }        
    });

    const message = {
        from : `${process.env.SMTP_FROM_NAME} <${process.env.SMTP_FROM_EMAIL}>`,
        to : options.email,
        subject : options.subject,
        text : options.message
    }

    await transporter.sendMail(message);
}

module.exports = sendEmail;