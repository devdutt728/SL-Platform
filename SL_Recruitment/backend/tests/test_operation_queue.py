from __future__ import annotations

import unittest

from app.services.operation_queue import (
    BASE_RETRY_SECONDS,
    MAX_RETRY_SECONDS,
    retry_delay_seconds,
)


class OperationQueueRetryPolicyTests(unittest.TestCase):
    def test_retry_backoff_starts_at_base_delay(self) -> None:
        self.assertEqual(retry_delay_seconds(1), BASE_RETRY_SECONDS)
        self.assertEqual(retry_delay_seconds(0), BASE_RETRY_SECONDS)
        self.assertEqual(retry_delay_seconds(-3), BASE_RETRY_SECONDS)

    def test_retry_backoff_is_exponential_and_capped(self) -> None:
        self.assertEqual(retry_delay_seconds(2), BASE_RETRY_SECONDS * 2)
        self.assertEqual(retry_delay_seconds(3), BASE_RETRY_SECONDS * 4)
        self.assertEqual(retry_delay_seconds(4), BASE_RETRY_SECONDS * 8)
        self.assertEqual(retry_delay_seconds(20), MAX_RETRY_SECONDS)

    def test_retry_backoff_is_non_decreasing(self) -> None:
        delays = [retry_delay_seconds(i) for i in range(1, 12)]
        self.assertListEqual(delays, sorted(delays))


if __name__ == "__main__":
    unittest.main()
