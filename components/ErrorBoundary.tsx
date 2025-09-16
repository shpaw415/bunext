import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorFallback } from "./fallback";

interface Props {
    children: ReactNode;
    fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo, reset: () => void) => ReactNode);
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    onReset?: () => void;
    resetKeys?: Array<string | number>;
    resetOnPropsChange?: boolean; // New prop to control reset behavior
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component that catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
        this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
    }

    static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error, errorInfo: null };
    }

    resetErrorBoundary() {
        this.setState({ hasError: false, error: null, errorInfo: null });
        this.props.onReset?.();
    }

    componentDidUpdate(prevProps: Props) {
        // Reset error boundary when children change (indicating a re-render from parent)
        if (this.state.hasError && this.props.resetOnPropsChange && prevProps.children !== this.props.children) {
            this.resetErrorBoundary();
            return;
        }

        // Also reset error boundary when resetKeys change
        if (this.state.hasError && prevProps.resetKeys !== this.props.resetKeys) {
            if (this.props.resetKeys && this.props.resetKeys.length > 0) {
                this.resetErrorBoundary();
            }
        }
    } componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log the error to an error reporting service
        console.error('[ErrorBoundary] Caught an error:', error, errorInfo);

        // Update state with error info
        this.setState({
            error,
            errorInfo,
        });

        // Call the onError callback if provided
        this.props.onError?.(error, errorInfo);
    }

    render() {
        if (this.state.hasError && this.state.error) {
            // You can render any custom fallback UI
            if (this.props.fallback) {
                // If fallback is a function, call it with error, errorInfo, and reset function
                if (typeof this.props.fallback === 'function') {
                    return this.props.fallback(this.state.error, this.state.errorInfo || {} as ErrorInfo, this.resetErrorBoundary);
                }
                // If fallback is a ReactNode, render it directly
                return this.props.fallback;
            }

            // Default fallback to ErrorFallback component
            return <ErrorFallback error={this.state.error} />;
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
