"use client";

import { useState, useEffect } from "react";
import {
  areNotificationsSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from "@/lib/research/notifications";

export function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("denied");
  useEffect(() => {
    void Promise.resolve().then(() => {
      setSupported(areNotificationsSupported());
      setPermission(getNotificationPermission());
    });
  }, []);

  const handleEnable = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? "granted" : "denied");
  };

  if (!supported) return null;

  return (
    <div className="notif-toggle">
      {permission === "granted" ? (
        <span className="notif-status on">
          ?? ֪ͨ�ѿ���
        </span>
      ) : permission === "denied" ? (
        <button
          className="notif-btn"
          onClick={handleEnable}
          title="�о����ʱ��������֪ͨ"
        >
          ?? ����֪ͨ
        </button>
      ) : (
        <button
          className="notif-btn"
          onClick={handleEnable}
          title="�о����ʱ��������֪ͨ"
        >
          ?? ����֪ͨ
        </button>
      )}
    </div>
  );
}