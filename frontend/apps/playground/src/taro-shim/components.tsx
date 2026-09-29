import React from "react";

type AnyProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

export const View: React.FC<AnyProps> = ({ children, ...rest }) =>
  React.createElement("div", rest, children);

export const Text: React.FC<AnyProps> = ({ children, ...rest }) =>
  React.createElement("span", rest, children);

export const Button: React.FC<AnyProps> = ({
  children,
  focus,
  ...rest
}) =>
  React.createElement(
    "button",
    { type: "button", autoFocus: focus === true, ...rest },
    children,
  );

export const Switch: React.FC<AnyProps> = ({
  children,
  checked,
  onChange,
  ...rest
}) =>
  React.createElement(
    "input",
    {
      type: "checkbox",
      role: "switch",
      checked,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        if (typeof onChange === "function") {
          onChange({ detail: { value: event.currentTarget.checked } });
        }
      },
      ...rest,
    },
    children,
  );
