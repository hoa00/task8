import {createFileRoute} from '@tanstack/react-router';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/reset-password')({validateSearch:input=>({state:input.state==='done'?'done':undefined}),component:PendingPage});
