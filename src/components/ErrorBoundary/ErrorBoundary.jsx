import { Component } from "react";
import "./ErrorBoundary.css";

/**
 * ErrorBoundary - Bắt mọi lỗi React runtime và hiển thị giao diện thân thiện
 * thay vì làm trắng toàn bộ màn hình.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("🔴 [ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="eb-overlay">
          <div className="eb-card">
            <div className="eb-icon">⚠️</div>
            <h1 className="eb-title">Có lỗi xảy ra</h1>
            <p className="eb-subtitle">
              Ứng dụng gặp sự cố không mong muốn. Vui lòng thử tải lại.
            </p>

            {this.state.error && (
              <div className="eb-error-box">
                <code>{this.state.error.toString()}</code>
              </div>
            )}

            <div className="eb-actions">
              <button className="eb-btn eb-btn-primary" onClick={this.handleReload}>
                🔄 Tải lại ứng dụng
              </button>
              <button className="eb-btn eb-btn-secondary" onClick={this.handleReset}>
                ↩ Thử lại
              </button>
            </div>

            <p className="eb-footer">
              Nếu lỗi tiếp tục xảy ra, vui lòng liên hệ hỗ trợ.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
