import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionLoggingFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    const message =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : (exceptionResponse as { message?: string | string[] })?.message ||
          "Internal server error";

    const errorName =
      exception instanceof Error ? exception.name : "UnknownException";
    const errorStack = exception instanceof Error ? exception.stack : undefined;

    const authUser = (request as Request & { authUser?: unknown }).authUser;
    const logPayload = {
      method: request.method,
      url: request.originalUrl || request.url,
      status,
      errorName,
      message,
      params: request.params,
      query: request.query,
      body: request.body,
      authUser,
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    };

    this.logger.error(
      `HTTP exception: ${request.method} ${request.originalUrl || request.url} -> ${status}`,
      errorStack,
      JSON.stringify(logPayload),
    );

    if (response.headersSent) return;

    response.status(status).json({
      statusCode: status,
      message,
      error: errorName,
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
    });
  }
}
