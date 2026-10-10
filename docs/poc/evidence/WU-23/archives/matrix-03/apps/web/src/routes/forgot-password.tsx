import {createFileRoute} from '@tanstack/react-router';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/forgot-password')({validateSearch:input=>({state:input.state==='sent'?'sent':undefined}),component:PendingPage});
