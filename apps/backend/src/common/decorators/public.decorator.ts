import { SetMetadata } from "@nestjs/common";

// Marks a route as not requiring JWT authentication.
// Read by JwtAuthGuard to short-circuit.
export const IS_PUBLIC_KEY = "isPublic";
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
