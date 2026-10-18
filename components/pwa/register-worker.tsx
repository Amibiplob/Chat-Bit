"use client";
import { useEffect } from 'react';
export function RegisterWorker(){useEffect(()=>{if('serviceWorker' in navigator&&window.isSecureContext&&process.env.NODE_ENV==='production'){void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>console.warn('ChatBit public offline fallback registration failed.'));}},[]);return null;}
