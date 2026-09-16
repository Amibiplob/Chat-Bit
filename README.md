ChatBit

<p align="center">
  <strong>Modern real-time communication platform built with Next.js, TypeScript, PostgreSQL, Supabase, and Prisma.</strong>
</p>

<p align="center">
  A portfolio-focused full-stack application designed to demonstrate real-world application architecture, authentication, real-time communication, scalable data modeling, and modern React development.
</p>

<p align="center">
  <a href="https://chat-bit-rouge.vercel.app">Live Demo</a>
  ·
  <a href="https://github.com/Amibiplob/Chat-Bit">Source Code</a>
</p>

Overview

ChatBit is a full-stack real-time communication platform inspired by modern messaging applications such as WhatsApp and Telegram.

The goal of ChatBit is not simply to build another chat UI. The project is being developed as a production-oriented portfolio application that demonstrates how a modern communication product can be structured across the frontend, backend, database, authentication, real-time infrastructure, file storage, and peer-to-peer communication layers.

The application uses Next.js App Router as the application framework, TypeScript for type safety, Supabase for managed PostgreSQL, authentication, realtime capabilities and storage, and Prisma ORM for database access and type-safe data modeling.

Project Goals

ChatBit is being built to demonstrate practical full-stack engineering skills, including:

Modern React and Next.js architecture

Type-safe application development

Authentication and authorization

Relational database design

ORM-based database access

Real-time application architecture

Server-side API design

File upload and storage workflows

WebRTC-based voice and video communication

Responsive UI development

Component-driven frontend architecture

Form validation and error handling

Secure handling of user data

Production-oriented project organization

Core Features

Authentication

ChatBit includes dedicated authentication flows designed around a modern application structure.

User registration

User login

Forgot-password flow

Protected application routes

Authentication-aware navigation

Server-side authentication integration

Authentication is designed around Supabase Auth and the Next.js server/client architecture.

Real-Time Messaging

The main product experience is centered around real-time communication.

Planned/core messaging capabilities include:

One-to-one conversations

Message persistence

Real-time message updates

Conversation-based UI

Message timestamps

User presence

Conversation state management

File Sharing

ChatBit is designed to support file sharing directly inside conversations.

The storage layer is planned around Supabase Storage so uploaded files can be associated with users and conversations while keeping application data in PostgreSQL.

Voice Calls

The application includes a dedicated call experience and is being structured to support browser-based audio communication.

The communication layer is intended to use WebRTC for peer-to-peer media connections.

Video Calls

ChatBit also includes a dedicated video-call experience.

The WebRTC architecture is intended to handle:

Camera access

Microphone access

Peer connections

Media streams

Call state

Connection lifecycle

Real-Time Application State

The frontend uses modern state-management patterns to coordinate interactive application state.

Zustand is included for client-side state management where local/global state is required.

Technology Stack

Frontend

Technology

Purpose

Next.js 16

Full-stack React framework

React 19

UI development

TypeScript

Static typing

Tailwind CSS 4

Styling

shadcn/ui / Base UI

Reusable UI components

Lucide React

UI icons

React Icons

Brand and additional icons

Zustand

Client-side state management

React Hook Form

Form management

Zod

Schema validation

Backend

Technology

Purpose

Next.js Route Handlers

Backend API endpoints

Prisma ORM

Type-safe database access

PostgreSQL

Relational application database

Supabase

Managed backend infrastructure

Supabase SSR

Authentication/session integration

Communication

Technology

Purpose

Supabase Realtime

Real-time application events/data

WebRTC

Peer-to-peer voice and video communication

Supabase Storage

File and media storage

Development

Tool

Purpose

pnpm

Package management

ESLint

Code quality

Vercel

Deployment

Architecture

ChatBit follows a full-stack architecture where the Next.js application acts as both the frontend and application backend.

┌─────────────────────────────────────────────┐
│                  ChatBit UI                 │
│        Next.js + React + TypeScript         │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│          Application / API Layer             │
│       Next.js Route Handlers / Server       │
└───────────────┬───────────────┬─────────────┘
                │               │
                ▼               ▼
       ┌────────────────┐   ┌────────────────┐
       │  Prisma ORM    │   │ Supabase APIs  │
       └───────┬────────┘   └───────┬────────┘
               │                    │
               ▼                    ├──────────────┐
       ┌────────────────┐            │              │
       │  PostgreSQL    │            ▼              ▼
       │    Database    │      Supabase Auth   Supabase Storage
       └────────────────┘
                                      │
                                      ▼
                               Realtime Services

                         Browser ↔ WebRTC ↔ Browser
                              Voice / Video

The architecture keeps the application logic organized while allowing specialized infrastructure to handle authentication, realtime events, storage, and peer-to-peer media communication.

Application Structure

The project uses the Next.js App Router and separates application routes from reusable UI and supporting libraries.

chat-bit/
│
├── app/
│   ├── (marketing)/
│   │   └── ...
│   │
│   ├── (auth)/
│   │   ├── login/
│   │   ├── signup/
│   │   ├── forgot-password/
│   │   └── ...
│   │
│   ├── call/
│   │   └── ...
│   │
│   ├── ...
│   └── layout.tsx
│
├── components/
│   ├── auth/
│   ├── layout/
│   ├── ui/
│   └── ...
│
├── lib/
│   ├── ...
│   └── ...
│
├── public/
│   └── ...
│
├── prisma.config.ts
├── components.json
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json

The exact structure will continue evolving as backend and realtime functionality is implemented.

Database

ChatBit uses PostgreSQL as its primary relational database.

Prisma ORM provides:

Type-safe database queries

Schema-driven development

Database relationships

Migration support

Generated TypeScript types

A structured data-access layer

The database is hosted through Supabase.

The data model is being designed around core communication concepts such as:

User
 │
 ├── Profile
 │
 ├── Conversations
 │      │
 │      ├── Participants
 │      │
 │      └── Messages
 │
 ├── Files
 │
 └── Calls

The schema will evolve as additional communication functionality is implemented.

Authentication

Authentication is integrated with Supabase Auth and the Next.js application architecture.

The project uses @supabase/ssr to support authentication across browser and server environments.

The intended flow is:

Browser
   │
   ▼
Authentication UI
   │
   ▼
Supabase Auth
   │
   ▼
Session
   │
   ├── Client Components
   │
   └── Server Components / Route Handlers

Protected application routes can then use the authenticated session to determine whether a user is allowed to access application resources.

Real-Time Communication

Real-time functionality is one of the central engineering goals of ChatBit.

Instead of relying entirely on traditional request/response communication, the application is designed to support live updates between connected clients.

For example:

User A
  │
  │ sends message
  ▼
ChatBit Backend
  │
  ▼
PostgreSQL
  │
  ▼
Realtime Event
  │
  ▼
User B
  │
  ▼
Message appears without page refresh

This architecture allows the application to move toward the experience users expect from modern messaging platforms.

Voice & Video Architecture

Voice and video communication are designed around WebRTC.

A simplified call flow looks like:

Caller                         Receiver
  │                               │
  │──── Call Request ────────────►│
  │                               │
  │◄──── Signaling Data ─────────►│
  │                               │
  │══════ WebRTC Connection ══════│
  │                               │
  │◄──── Audio / Video Stream ───►│

WebRTC is responsible for establishing the peer-to-peer media connection, while the application layer handles the surrounding call state and signaling requirements.

Validation & Type Safety

ChatBit uses TypeScript throughout the application.

Form and request validation is handled with Zod, while React Hook Form is used for form state and submission workflows.

This combination helps keep validation close to the data boundary:

User Input
    │
    ▼
React Hook Form
    │
    ▼
Zod Validation
    │
    ▼
Validated Data
    │
    ▼
Server / API

This reduces the chance of invalid data reaching the backend.

UI Architecture

The frontend is built around reusable components rather than putting all UI logic directly inside route files.

The project uses:

Reusable UI primitives

Feature-oriented components

Route-level layouts

Responsive navigation

Mobile-specific navigation patterns

Shared form components

Consistent design tokens

Tailwind CSS

shadcn/Base UI components

The goal is to keep UI components composable and maintainable as the application grows.

Design Direction

ChatBit is designed as a modern communication product rather than a generic dashboard.

The landing experience communicates the major product capabilities:

Messaging

File sharing

Voice calls

Video calls

Real-time communication

Security

Responsive application experience

The application also includes dedicated authentication and communication routes so the public marketing experience and authenticated product experience remain separated.

Performance Considerations

Performance is considered throughout the architecture rather than treated only as a final optimization step.

Areas being considered include:

Next.js Server Components

Client Components only where interaction requires them

Route-level code splitting

Optimized assets

Responsive UI

Efficient database queries

Indexed relational data

Avoiding unnecessary client-side state

Realtime subscription lifecycle management

WebRTC peer-to-peer media communication

As the backend implementation grows, database queries and realtime subscriptions will be profiled and optimized based on actual application behavior.

Security Considerations

Security is treated as part of the application architecture.

Important areas include:

Authentication through Supabase Auth

Server-side session verification

Protected application routes

Input validation with Zod

Database-level access controls

Controlled file access

Environment variables for secrets

Avoiding exposure of server-only credentials

Authorization checks before accessing user-owned resources

Sensitive credentials should never be committed to the repository.

Local Development

Prerequisites

Make sure you have:

Node.js

pnpm

A Supabase project

PostgreSQL database access

Git

1. Clone the repository

git clone https://github.com/Amibiplob/Chat-Bit.git

cd Chat-Bit

2. Install dependencies

pnpm install

3. Configure environment variables

Create a .env.local file in the project root.

Example:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

DATABASE_URL=
DIRECT_URL=

Do not commit .env.local or any file containing private credentials.

The exact environment variables may change as backend functionality is added.

4. Configure the database

After configuring the PostgreSQL connection, generate the Prisma client:

pnpm exec prisma generate

Run the appropriate Prisma database workflow for the current schema.

5. Start the development server

pnpm dev

Open:

http://localhost:3000

Available Scripts

Command

Description

pnpm dev

Start development server

pnpm build

Create production build

pnpm start

Start production server

pnpm lint

Run ESLint

pnpm exec prisma generate

Generate Prisma Client

Deployment

ChatBit is designed to be deployable using Vercel for the Next.js application.

The production architecture uses managed services rather than requiring a dedicated server:

                    ┌───────────────┐
                    │    Vercel     │
                    │   Next.js     │
                    └───────┬───────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
        Supabase Auth   PostgreSQL     Supabase
                                      Realtime/Storage

This keeps the infrastructure relatively simple while allowing the application to scale beyond a purely local development environment.

Current Development Status

ChatBit is an actively developed portfolio project.

Implemented / In Progress

Next.js App Router foundation

TypeScript

Responsive marketing/landing structure

Authentication route structure

Login flow UI

Signup flow UI

Forgot-password route

Application route structure

Dedicated call route

Reusable component architecture

Tailwind CSS

shadcn/Base UI components

Supabase integration foundation

Prisma configuration

PostgreSQL architecture

Client-side state management foundation

Complete messaging backend

Complete realtime messaging

File upload/storage workflow

Voice calling

Video calling

Complete WebRTC signaling

Production testing

CI/CD automation

The checklist reflects the development state of the repository and will be updated as features are completed.

Roadmap

Phase 1 — Foundation

Application architecture

Marketing pages

Authentication routes

Shared UI system

Database architecture

Phase 2 — Core Communication

User profiles

Conversation creation

Direct messaging

Message persistence

Realtime message delivery

Online/offline presence

Typing indicators

Phase 3 — Media & Files

File uploads

Image previews

Document sharing

Supabase Storage integration

Message attachments

Phase 4 — Calling

Call signaling

Audio calls

Video calls

Camera/microphone controls

Call status

Call termination

WebRTC connection management

Phase 5 — Production Engineering

Automated tests

GitHub Actions

Error monitoring

Performance profiling

Database query optimization

Security hardening

Production deployment

Engineering Decisions

Why Next.js?

Next.js provides the foundation for both the user interface and server-side application logic.

Using the App Router allows ChatBit to combine:

Server Components

Client Components

Route Handlers

Layouts

Server-side data access

Modern React patterns

Why TypeScript?

A communication platform has many interconnected entities and states.

TypeScript helps make those relationships explicit and reduces runtime errors as the application grows.

Why PostgreSQL?

Messaging applications naturally contain relational data:

Users

Conversations

Participants

Messages

Attachments

Calls

PostgreSQL provides a strong relational model for these relationships.

Why Prisma?

Prisma provides a type-safe interface between the application and PostgreSQL while keeping database models explicit and maintainable.

Why Supabase?

Supabase provides several backend capabilities that fit the project:

PostgreSQL

Authentication

Realtime functionality

File storage

This allows ChatBit to use managed infrastructure without requiring a large custom backend platform.

Why WebRTC?

Voice and video calls require efficient real-time media communication.

WebRTC provides browser-native peer-to-peer communication capabilities, making it suitable for the calling layer.

What This Project Demonstrates

ChatBit is intentionally designed to demonstrate more than frontend development.

A recruiter reviewing the project can see work across:

Frontend Engineering

React

Next.js

TypeScript

Responsive UI

Component architecture

Form handling

Client-side state

Backend Engineering

API route design

Authentication

Authorization

Database access

Validation

Server-side application logic

Database Engineering

PostgreSQL

Relational modeling

Prisma ORM

Data relationships

Query design

Real-Time Engineering

Supabase Realtime

WebRTC

Live application state

Peer-to-peer communication

Production Engineering

Environment configuration

Deployment

Performance considerations

Security considerations

Maintainable project structure

Project Status

ChatBit is currently under active development.

The repository represents an evolving full-stack application rather than a finished commercial product. Features listed in the roadmap are intentionally documented so the development direction remains transparent.

Author

Md Biplob Hosain

Junior Full-Stack / Software Engineer

Portfolio: amibiplob.vercel.app

GitHub: github.com/Amibiplob

LinkedIn: linkedin.com/in/amibiplob

License

This project is currently intended as a personal portfolio and learning project.

See the repository for the current licensing status.