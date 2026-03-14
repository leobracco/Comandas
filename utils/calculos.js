const calcularPrecioVenta = (costoTotal, markup) => {
    if (markup >= 100) return 0;
    return (costoTotal / (100 - markup)) * 100;
};

module.exports = { calcularPrecioVenta };