import "next-auth";

declare module "next-auth" {
  interface Session {
    googleIdToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleIdToken?: string;
  }
}
