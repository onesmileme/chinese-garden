import React from "react";

type AnyProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

export const View: React.FC<AnyProps> = ({ children, ...rest }) =>
  React.createElement("div", rest, children);

export const Text: React.FC<AnyProps> = ({ children, ...rest }) =>
  React.createElement("span", rest, children);

export const Button: React.FC<AnyProps> = ({ children, ...rest }) =>
  React.createElement("button", { type: "button", ...rest }, children);
