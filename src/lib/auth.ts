// NextAuth.js v5 configuration for MD Carton Output System
// Credentials-based authentication for MVP

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";

export class OperatorInAdminPortalError extends CredentialsSignin {
  code = "operator_in_admin_portal";
}

export class AdminInOperatorPortalError extends CredentialsSignin {
  code = "admin_in_operator_portal";
}

declare module "next-auth" {
  interface User {
    role: Role;
    username: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      username: string;
      role: Role;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    username: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        portal: { label: "Portal", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: (credentials.username as string).trim() },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        // Enforce strict portal-level role authorization
        const portal = credentials.portal as string | undefined;
        if (portal === "admin" && user.role === "OPERATOR") {
          throw new OperatorInAdminPortalError();
        }

        if (portal === "operator" && (user.role === "ADMIN" || user.role === "MANAGER")) {
          throw new AdminInOperatorPortalError();
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.username = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.username = token.username;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
