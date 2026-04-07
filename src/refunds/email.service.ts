import { ConfigService } from "@nestjs/config";
import sgMail from "@sendgrid/mail";
import { Injectable } from "@nestjs/common";

@Injectable()
export class EmailService {
  private frontendUrl: string;
  private noReplyEmail: string;

  constructor(private configService: ConfigService) {
    this.noReplyEmail = this.configService.get<string>("NOREPLY_EMAIL")!;
    sgMail.setApiKey(this.configService.get<string>("SENDGRID_API_KEY")!);

    this.frontendUrl = this.configService.get<string>("FRONTEND_URL")!;
  }

  private getEmailHtml(title: string, children: string) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #faf9f7;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf9f7; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(180deg, #5b6f5a 0%, #3f4f3f 100%); padding: 24px 0px 24px; text-align: center;">
                  <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">${title}</h1>
                </td>
              </tr>
              
              <!-- Content -->
              ${children}
              
              <!-- Footer -->
              <tr>
                <td style="padding: 24px 0px; text-align: center; border-top: 1px solid #e2e2e2;">
                  <p style="color: #9c9c9c; font-size: 12px; margin: 0 0 8px 0;">
                    Need help? Contact us at <a href="mailto:support@mystorapp.com" style="color: #5b6f5a; text-decoration: none;">support@mystorapp.com</a>
                  </p>
                  <p style="color: #9c9c9c; font-size: 12px; margin: 0;">
                    © ${new Date().getFullYear()} Mystor. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  async sendRefundRequestEmail(email: string) {
    const html = `
    ${this.getEmailHtml(
      "Refund request approved.",
      `
        <tr>
          <td style="padding: 20px;">
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; text-align: center">
              A refund request has been approved for your purchase. <br /> The refund will be processed within 3-10 business days depending on your bank.
            </p>
             
            <!-- CTA Button -->
            <div style="text-align: center; margin: 20px 0 12px 0;">
              <a href="${this.frontendUrl}/dashboard/support?tab=refunds" style="display: inline-block; background: linear-gradient(180deg, #5b6f5a 0%, #3f4f3f 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(91, 111, 90, 0.3);">
                View refund
              </a>
            </div>
          </td>
        </tr>`,
    )}`;

    await sgMail.send({
      from: this.noReplyEmail,
      to: email,
      subject: "Refund Request Approved",
      html,
    });
  }
}
