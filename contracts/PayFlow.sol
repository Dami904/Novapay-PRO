// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PayFlow {
    event PayrollBatch(
        address indexed sender,
        string  label,
        uint256 recipientCount,
        uint256 totalAmount,
        uint256 timestamp
    );

    function batchPayout(
        address            token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        string    calldata label
    ) external {
        require(recipients.length == amounts.length, "PayFlow: length mismatch");
        require(recipients.length > 0,               "PayFlow: empty recipients");

        IERC20  erc20 = IERC20(token);
        uint256 total = 0;

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "PayFlow: zero address recipient");
            require(amounts[i]    >  0,          "PayFlow: zero amount");
            total += amounts[i];
            require(erc20.transferFrom(msg.sender, recipients[i], amounts[i]), "PayFlow: transfer failed");
        }

        emit PayrollBatch(msg.sender, label, recipients.length, total, block.timestamp);
    }
}
