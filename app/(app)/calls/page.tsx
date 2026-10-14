import React from 'react'
import { requireUser } from '@/lib/server/auth'

export default async function page() {
  await requireUser();
  return (
    <div>page</div>
  )
}
